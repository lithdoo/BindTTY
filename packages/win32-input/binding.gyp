{
  "targets": [
    {
      "target_name": "bindtty_win32_input",
      "sources": [ "src/win32_input.cc" ],
      "conditions": [
        [ "OS=='win'", {
          "defines": [ "WIN32_LEAN_AND_MEAN", "NOMINMAX" ]
        }, {
          "type": "none"
        } ]
      ]
    }
  ]
}
