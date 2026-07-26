#include <node_api.h>

#ifdef _WIN32
#include <windows.h>
#include <atomic>
#include <new>

struct KeyRecord {
  bool key_down;
  WORD repeat_count;
  WORD virtual_key_code;
  WORD scan_code;
  WCHAR unicode;
  DWORD control_key_state;
};

struct ProviderState {
  HANDLE input = INVALID_HANDLE_VALUE;
  DWORD original_mode = 0;
  bool mode_changed = false;
  HANDLE stop_event = nullptr;
  HANDLE thread = nullptr;
  napi_threadsafe_function callback = nullptr;
  std::atomic<bool> stopped{false};
};

static void ThrowLastError(napi_env env, const char* message) {
  DWORD code = GetLastError();
  char buffer[160];
  wsprintfA(buffer, "%s (Win32 error %lu)", message, code);
  napi_throw_error(env, nullptr, buffer);
}

static void CallJs(
  napi_env env,
  napi_value callback,
  void*,
  void* data
) {
  KeyRecord* record = static_cast<KeyRecord*>(data);
  if (env != nullptr && callback != nullptr) {
    napi_value object;
    napi_create_object(env, &object);

    napi_value value;
    napi_get_boolean(env, record->key_down, &value);
    napi_set_named_property(env, object, "keyDown", value);
    napi_create_uint32(env, record->virtual_key_code, &value);
    napi_set_named_property(env, object, "virtualKeyCode", value);
    napi_create_uint32(env, record->scan_code, &value);
    napi_set_named_property(env, object, "scanCode", value);
    napi_create_string_utf16(
      env,
      reinterpret_cast<const char16_t*>(&record->unicode),
      record->unicode == 0 ? 0 : 1,
      &value
    );
    napi_set_named_property(env, object, "unicode", value);
    napi_create_uint32(env, record->control_key_state, &value);
    napi_set_named_property(env, object, "controlKeyState", value);
    napi_create_uint32(env, record->repeat_count, &value);
    napi_set_named_property(env, object, "repeatCount", value);

    napi_value undefined;
    napi_get_undefined(env, &undefined);
    napi_call_function(env, undefined, callback, 1, &object, nullptr);
  }
  delete record;
}

static DWORD WINAPI ReadLoop(LPVOID parameter) {
  ProviderState* state = static_cast<ProviderState*>(parameter);
  HANDLE handles[] = { state->stop_event, state->input };

  while (!state->stopped.load()) {
    DWORD wait = WaitForMultipleObjects(2, handles, FALSE, INFINITE);
    if (wait == WAIT_OBJECT_0 || wait == WAIT_FAILED) {
      break;
    }
    if (wait != WAIT_OBJECT_0 + 1) {
      continue;
    }

    INPUT_RECORD records[32];
    DWORD count = 0;
    if (!ReadConsoleInputW(state->input, records, 32, &count)) {
      break;
    }

    for (DWORD index = 0; index < count; ++index) {
      if (records[index].EventType != KEY_EVENT) {
        continue;
      }
      const KEY_EVENT_RECORD& key = records[index].Event.KeyEvent;
      KeyRecord* copy = new (std::nothrow) KeyRecord{
        key.bKeyDown != FALSE,
        key.wRepeatCount,
        key.wVirtualKeyCode,
        key.wVirtualScanCode,
        key.uChar.UnicodeChar,
        key.dwControlKeyState
      };
      if (copy == nullptr) {
        continue;
      }
      if (
        napi_call_threadsafe_function(
          state->callback,
          copy,
          napi_tsfn_nonblocking
        ) != napi_ok
      ) {
        delete copy;
      }
    }
  }

  return 0;
}

static void StopProvider(ProviderState* state) {
  if (state == nullptr || state->stopped.exchange(true)) {
    return;
  }
  SetEvent(state->stop_event);
  if (state->thread != nullptr) {
    WaitForSingleObject(state->thread, INFINITE);
    CloseHandle(state->thread);
    state->thread = nullptr;
  }
  if (state->mode_changed) {
    SetConsoleMode(state->input, state->original_mode);
    state->mode_changed = false;
  }
  if (state->callback != nullptr) {
    napi_release_threadsafe_function(state->callback, napi_tsfn_abort);
    state->callback = nullptr;
  }
  if (state->stop_event != nullptr) {
    CloseHandle(state->stop_event);
    state->stop_event = nullptr;
  }
}

static void CleanupProvider(void* data) {
  ProviderState* state = static_cast<ProviderState*>(data);
  StopProvider(state);
  delete state;
}

static napi_value Dispose(napi_env env, napi_callback_info info) {
  void* data = nullptr;
  napi_get_cb_info(env, info, nullptr, nullptr, nullptr, &data);
  ProviderState* state = static_cast<ProviderState*>(data);
  StopProvider(state);
  napi_value undefined;
  napi_get_undefined(env, &undefined);
  return undefined;
}

static napi_value IsAvailable(napi_env env, napi_callback_info) {
  HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
  DWORD mode = 0;
  bool available =
    input != nullptr &&
    input != INVALID_HANDLE_VALUE &&
    GetConsoleMode(input, &mode) != FALSE;
  napi_value result;
  napi_get_boolean(env, available, &result);
  return result;
}

static napi_value Attach(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  napi_valuetype type;
  if (argc != 1 || napi_typeof(env, argv[0], &type) != napi_ok || type != napi_function) {
    napi_throw_type_error(env, nullptr, "listener must be a function");
    return nullptr;
  }

  HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
  DWORD mode = 0;
  if (
    input == nullptr ||
    input == INVALID_HANDLE_VALUE ||
    GetConsoleMode(input, &mode) == FALSE
  ) {
    napi_throw_error(env, nullptr, "Win32 console input is unavailable");
    return nullptr;
  }

  ProviderState* state = new (std::nothrow) ProviderState();
  if (state == nullptr) {
    napi_throw_error(env, nullptr, "Unable to allocate Win32 input provider");
    return nullptr;
  }
  state->input = input;
  state->original_mode = mode;
  DWORD native_mode = mode & ~(
    ENABLE_PROCESSED_INPUT |
    ENABLE_LINE_INPUT |
    ENABLE_ECHO_INPUT |
    ENABLE_VIRTUAL_TERMINAL_INPUT
  );
  if (SetConsoleMode(input, native_mode) == FALSE) {
    delete state;
    ThrowLastError(env, "Unable to enable Win32 console record input");
    return nullptr;
  }
  state->mode_changed = native_mode != mode;
  state->stop_event = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  if (state->stop_event == nullptr) {
    if (state->mode_changed) {
      SetConsoleMode(input, mode);
    }
    delete state;
    ThrowLastError(env, "Unable to create Win32 input stop event");
    return nullptr;
  }

  napi_value resource_name;
  napi_create_string_utf8(env, "BindTTYWin32Input", NAPI_AUTO_LENGTH, &resource_name);
  if (
    napi_create_threadsafe_function(
      env,
      argv[0],
      nullptr,
      resource_name,
      0,
      1,
      nullptr,
      nullptr,
      nullptr,
      CallJs,
      &state->callback
    ) != napi_ok
  ) {
    if (state->mode_changed) {
      SetConsoleMode(input, mode);
    }
    CloseHandle(state->stop_event);
    delete state;
    napi_throw_error(env, nullptr, "Unable to create Win32 input callback");
    return nullptr;
  }

  state->thread = CreateThread(nullptr, 0, ReadLoop, state, 0, nullptr);
  if (state->thread == nullptr) {
    napi_release_threadsafe_function(state->callback, napi_tsfn_abort);
    CloseHandle(state->stop_event);
    if (state->mode_changed) {
      SetConsoleMode(input, mode);
    }
    delete state;
    ThrowLastError(env, "Unable to start Win32 input thread");
    return nullptr;
  }

  napi_add_env_cleanup_hook(env, CleanupProvider, state);
  napi_value dispose;
  napi_create_function(env, "dispose", NAPI_AUTO_LENGTH, Dispose, state, &dispose);
  return dispose;
}

NAPI_MODULE_INIT() {
  napi_property_descriptor properties[] = {
    { "isAvailable", nullptr, IsAvailable, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "attach", nullptr, Attach, nullptr, nullptr, nullptr, napi_default, nullptr }
  };
  napi_define_properties(env, exports, 2, properties);
  return exports;
}

#else

NAPI_MODULE_INIT() {
  return exports;
}

#endif
