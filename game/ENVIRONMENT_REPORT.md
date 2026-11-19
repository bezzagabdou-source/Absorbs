# Environment report — 2026-11-19

Checked inside the sandbox at the start of the task:

| Tool | Result |
| --- | --- |
| `unity-editor`, `Unity`, `Godot`, `dotnet` | not installed |
| `java`, `javac`, `gradle`, `sdkmanager`, `adb`, `blender` | not installed |
| Python 3, git, gh CLI, Node/npm | present |
| Network allowlist | `github.com`, `api.github.com`, `codeload.github.com`, `registry.npmjs.org`, `pypi.org`, `files.pythonhosted.org` only |
| GitHub release asset CDN (`objects.githubusercontent.com`) | blocked locally, reachable from GitHub Actions runners |
| `gh auth status` | authenticated as `bezzagabdou-source` |
| Private repo creation | **denied** by token: `GraphQL: Resource not accessible by integration (createRepository)` |
| GitHub Actions in `bezzagabdou-source/Absorbs` | working (recent successful runs observed) |

## Engine decision

Unity is unavailable and cannot be downloaded here; a Unity build additionally needs a
license that cannot be provisioned non-interactively. **Godot 4.4.1-stable + GDScript**
was selected: it is a native engine, exports a real Android APK without a WebView, and
its editor/export templates/Android SDK can be installed on a GitHub-hosted runner with
full internet access. All compilation, import, smoke tests, signing and packaging
therefore happen in `.github/workflows/build-android.yml`, not in this sandbox.

## Repository decision

The requested new **private** repository could not be created with the available token
(permission error above). All source lives on this session's branch first; it can be
pushed verbatim to a private repository as soon as repo-creation permission is granted.
