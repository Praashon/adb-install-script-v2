# Bundled scrcpy

Screen mirroring uses [scrcpy](https://github.com/Genymobile/scrcpy). The app
looks for the scrcpy executable in this folder first, then falls back to a
scrcpy on the system PATH, then to a custom path set in Settings.

To bundle scrcpy into the packaged installer, download the release for the
target platform and extract its contents directly into this folder, so the
layout is:

    resources/scrcpy/
      scrcpy.exe          (scrcpy on macOS/Linux)
      scrcpy-server
      *.dll               (Windows runtime libraries)

electron-builder ships everything in this folder as an app resource, and the
app sets SCRCPY_SERVER_PATH and ADB so scrcpy uses the same device connection.

The binaries themselves are not committed to version control. Place them here
before running `npm run build:win` for a self-contained installer. Without
them, mirroring still works for anyone who has scrcpy installed on PATH.
