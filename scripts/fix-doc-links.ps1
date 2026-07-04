$ErrorActionPreference = "Stop"
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not (Test-Path "$root/doc/CONVENTIONS.md")) { $root = "C:\Users\lithd\Documents\GitHub\BindTTY" }

$files = Get-ChildItem -Path "$root" -Recurse -Include "*.md" -File |
  Where-Object { $_.FullName -notmatch '\\node_modules\\' }

foreach ($file in $files) {
  $rel = $file.FullName.Substring($root.Length + 1).Replace('\', '/')
  $content = [IO.File]::ReadAllText($file.FullName)

  # Root-level path updates (doc/xxx.md -> doc/sub/xxx.md)
  $content = $content -replace 'doc/DISPLAY_WIDTH\.md', 'doc/specs/DISPLAY_WIDTH.md'
  $content = $content -replace 'doc/TEXT_INPUT\.md', 'doc/widgets/TEXT_INPUT.md'
  $content = $content -replace 'doc/PROGRESS_BAR\.md', 'doc/widgets/PROGRESS_BAR.md'
  $content = $content -replace 'doc/ELEMENT_REF\.md', 'doc/specs/ELEMENT_REF.md'
  $content = $content -replace 'doc/SCROLL_VIEWPORT\.md', 'doc/specs/SCROLL_VIEWPORT.md'
  $content = $content -replace 'doc/YOGA_AND_TEXT\.md', 'doc/specs/YOGA_AND_TEXT.md'
  $content = $content -replace 'doc/DESIGN\.md', 'doc/architecture/DESIGN.md'
  $content = $content -replace 'doc/TUI_IMPLEMENTATION_PLAN\.md', 'doc/architecture/ROADMAP.md'
  $content = $content -replace 'doc/E2E_TESTING\.md', 'doc/testing/E2E.md'
  $content = $content -replace 'doc/M7_SCROLL_VIEWPORT\.md', 'doc/specs/SCROLL_VIEWPORT.md'
  $content = $content -replace 'doc/NODE_SETUP\.md', 'doc/specs/ELEMENT_REF.md'
  $content = $content -replace 'doc/YOGA_LAYOUT\.md', 'doc/specs/YOGA_AND_TEXT.md'
  $content = $content -replace '\./doc/VNODE\.md', './doc/packages/VNODE.md'
  $content = $content -replace '\./doc/JSX_RUNTIME\.md', './doc/packages/JSX_RUNTIME.md'
  $content = $content -replace '\./doc/RUNTIME\.md', './doc/packages/RUNTIME.md'
  $content = $content -replace '\./doc/LAYOUT\.md', './doc/packages/LAYOUT.md'
  $content = $content -replace '\./doc/RENDERER\.md', './doc/packages/RENDERER.md'
  $content = $content -replace '\./doc/TERMINAL\.md', './doc/packages/TERMINAL.md'
  $content = $content -replace '\./doc/INTERACTION\.md', './doc/packages/INTERACTION.md'
  $content = $content -replace '\./doc/WIDGETS\.md', './doc/packages/WIDGETS.md'
  $content = $content -replace '\./doc/APP\.md', './doc/packages/APP.md'
  $content = $content -replace '\./doc/DISPLAY_WIDTH\.md', './doc/specs/DISPLAY_WIDTH.md'
  $content = $content -replace '\./doc/TEXT_INPUT\.md', './doc/widgets/TEXT_INPUT.md'
  $content = $content -replace '\./doc/PROGRESS_BAR\.md', './doc/widgets/PROGRESS_BAR.md'
  $content = $content -replace '\./doc/E2E_TESTING\.md', './doc/testing/E2E.md'
  $content = $content -replace '\./doc/DESIGN\.md', './doc/architecture/DESIGN.md'
  $content = $content -replace '\./doc/TUI_IMPLEMENTATION_PLAN\.md', './doc/architecture/ROADMAP.md'
  $content = $content -replace '\./doc/M7_SCROLL_VIEWPORT\.md', './doc/specs/SCROLL_VIEWPORT.md'

  if ($rel -like 'doc/packages/*') {
    $content = $content -replace '\(\./DESIGN\.md\)', '(../architecture/DESIGN.md)'
    $content = $content -replace '\(\./TUI_IMPLEMENTATION_PLAN\.md\)', '(../architecture/ROADMAP.md)'
    $content = $content -replace '\(\./DISPLAY_WIDTH\.md\)', '(../specs/DISPLAY_WIDTH.md)'
    $content = $content -replace '\(\./TEXT_INPUT\.md\)', '(../widgets/TEXT_INPUT.md)'
    $content = $content -replace '\(\./PROGRESS_BAR\.md\)', '(../widgets/PROGRESS_BAR.md)'
    $content = $content -replace '\(\./E2E_TESTING\.md\)', '(../testing/E2E.md)'
    $content = $content -replace '\(\./M7_SCROLL_VIEWPORT\.md\)', '(../specs/SCROLL_VIEWPORT.md)'
    $content = $content -replace '\(\./NODE_SETUP\.md\)', '(../specs/ELEMENT_REF.md)'
    $content = $content -replace '\(\./YOGA_LAYOUT\.md\)', '(../specs/YOGA_AND_TEXT.md)'
    $content = $content -replace 'DISPLAY_WIDTH\.md', '../specs/DISPLAY_WIDTH.md'
  }
  elseif ($rel -like 'doc/widgets/*') {
    $content = $content -replace '\(\./DISPLAY_WIDTH\.md\)', '(../specs/DISPLAY_WIDTH.md)'
    $content = $content -replace '\(\./WIDGETS\.md\)', '(../packages/WIDGETS.md)'
  }
  elseif ($rel -like 'doc/specs/*') {
    $content = $content -replace '\(\./WIDGETS\.md\)', '(../packages/WIDGETS.md)'
    $content = $content -replace '\(\./INTERACTION\.md\)', '(../packages/INTERACTION.md)'
    $content = $content -replace '\(\./APP\.md\)', '(../packages/APP.md)'
    $content = $content -replace '\(\./VNODE\.md\)', '(../packages/VNODE.md)'
    $content = $content -replace '\(\./JSX_RUNTIME\.md\)', '(../packages/JSX_RUNTIME.md)'
    $content = $content -replace '\(\./LAYOUT\.md\)', '(../packages/LAYOUT.md)'
    $content = $content -replace '\(\./RENDERER\.md\)', '(../packages/RENDERER.md)'
    $content = $content -replace '\(\./TERMINAL\.md\)', '(../packages/TERMINAL.md)'
    $content = $content -replace '\(\./YOGA_LAYOUT\.md\)', '(./YOGA_AND_TEXT.md)'
    $content = $content -replace '\(\./TUI_IMPLEMENTATION_PLAN\.md\)', '(../architecture/ROADMAP.md)'
    $content = $content -replace '\(\./DESIGN\.md\)', '(../architecture/DESIGN.md)'
    $content = $content -replace '\(\./E2E_TESTING\.md\)', '(../testing/E2E.md)'
    $content = $content -replace '\(\./M7_SCROLL_VIEWPORT\.md\)', '(./SCROLL_VIEWPORT.md)'
    $content = $content -replace '\(\./NODE_SETUP\.md\)', '(./ELEMENT_REF.md)'
    $content = $content -replace '\(\./archive/WIDE_TEXT_IMPLEMENTATION_PLAN\.md\)', '(../archive/WIDE_TEXT_IMPLEMENTATION_PLAN.md)'
    $content = $content -replace '\(\./archive/WIDE_TEXT_IMPLEMENTATION_PLAN\.md\)', '(../archive/WIDE_TEXT_IMPLEMENTATION_PLAN.md)'
  }
  elseif ($rel -like 'doc/architecture/*') {
    $content = $content -replace '\(\./README\.md\)', '(../README.md)'
    $content = $content -replace '\(\./TUI_IMPLEMENTATION_PLAN\.md\)', '(./ROADMAP.md)'
    $content = $content -replace '\(\./LAYOUT\.md\)', '(../packages/LAYOUT.md)'
    $content = $content -replace '\(\./VNODE\.md\)', '(../packages/VNODE.md)'
    $content = $content -replace '\(\./M7_SCROLL_VIEWPORT\.md\)', '(../specs/SCROLL_VIEWPORT.md)'
    $content = $content -replace '\(\./DISPLAY_WIDTH\.md\)', '(../specs/DISPLAY_WIDTH.md)'
  }
  elseif ($rel -like 'doc/testing/*') {
    $content = $content -replace '\(\./DISPLAY_WIDTH\.md\)', '(../specs/DISPLAY_WIDTH.md)'
    $content = $content -replace '\(\./M7_SCROLL_VIEWPORT\.md\)', '(../specs/SCROLL_VIEWPORT.md)'
    $content = $content -replace '\(\./APP\.md\)', '(../packages/APP.md)'
    $content = $content -replace '\(\./E2E_TESTING\.md\)', '(./E2E.md)'
    $content = $content -replace '\(\./TUI_IMPLEMENTATION_PLAN\.md\)', '(../architecture/ROADMAP.md)'
  }
  elseif ($rel -like 'doc/archive/plans/*') {
    $content = $content -replace '\(\./DISPLAY_WIDTH\.md\)', '(../../specs/DISPLAY_WIDTH.md)'
    $content = $content -replace '\(\.\./DISPLAY_WIDTH\.md\)', '(../../specs/DISPLAY_WIDTH.md)'
    $content = $content -replace '\(\./LAYOUT\.md\)', '(../../packages/LAYOUT.md)'
    $content = $content -replace '\(\.\./LAYOUT\.md\)', '(../../packages/LAYOUT.md)'
    $content = $content -replace '\(\./RENDERER\.md\)', '(../../packages/RENDERER.md)'
    $content = $content -replace '\(\./VNODE\.md\)', '(../../packages/VNODE.md)'
    $content = $content -replace '\(\./NODE_SETUP\.md\)', '(../../specs/ELEMENT_REF.md)'
    $content = $content -replace '\(\./M7_SCROLL_VIEWPORT\.md\)', '(./M7_SCROLL_VIEWPORT_PLAN.md)'
    $content = $content -replace '\(\./YOGA_LAYOUT\.md\)', '(./YOGA_LAYOUT_PLAN.md)'
    $content = $content -replace '\(\./TUI_IMPLEMENTATION_PLAN\.md\)', '(../../architecture/ROADMAP.md)'
    $content = $content -replace '\(\./E2E_TESTING\.md\)', '(../../testing/E2E.md)'
    $content = $content -replace '\(\./WIDE_TEXT_IMPLEMENTATION_PLAN\.md\)', '(../WIDE_TEXT_IMPLEMENTATION_PLAN.md)'
    $content = $content -replace 'doc/NODE_SETUP\.md', 'doc/specs/ELEMENT_REF.md'
    $content = $content -replace 'doc/M7_SCROLL_VIEWPORT\.md', 'doc/specs/SCROLL_VIEWPORT.md'
  }
  elseif ($rel -like 'doc/archive/*') {
    $content = $content -replace '\(\.\./VNODE\.md\)', '(../packages/VNODE.md)'
    $content = $content -replace '\(\.\./DISPLAY_WIDTH\.md\)', '(../specs/DISPLAY_WIDTH.md)'
    $content = $content -replace '\(\.\./YOGA_LAYOUT\.md\)', '(../specs/YOGA_AND_TEXT.md)'
    $content = $content -replace '\(\./YOGA_LAYOUT\.md\)', '(plans/YOGA_LAYOUT_PLAN.md)'
    $content = $content -replace '\(\./M7_SCROLL_VIEWPORT\.md\)', '(plans/M7_SCROLL_VIEWPORT_PLAN.md)'
    $content = $content -replace '\(\./NODE_SETUP\.md\)', '(../specs/ELEMENT_REF.md)'
    $content = $content -replace '\(\.\./WIDE_TEXT_IMPLEMENTATION_PLAN\.md\)', '(./WIDE_TEXT_IMPLEMENTATION_PLAN.md)'
  }
  elseif ($rel -like 'doc/redirects/*') {
    $content = $content -replace '\(\./DISPLAY_WIDTH\.md\)', '(../specs/DISPLAY_WIDTH.md)'
    $content = $content -replace '\(\./archive/WIDE_TEXT_IMPLEMENTATION_PLAN\.md\)', '(../archive/WIDE_TEXT_IMPLEMENTATION_PLAN.md)'
  }

  [IO.File]::WriteAllText($file.FullName, $content)
}
Write-Host "Fixed links in $($files.Count) markdown files"
