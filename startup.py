"""
Launcher for Network Topology Mapper.

Sets up the virtual environment if it's missing, asks for admin rights
(sudo on Linux, a UAC prompt on Windows) so Nmap can do OS detection and SYN
scans, then starts the app. If elevation isn't possible or is declined, the
app still starts, just with reduced scanning abilities.
"""

import ctypes
import os
import platform
import shutil
import subprocess
import sys

# Every path below is relative to this file, so it works from any directory
ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

IS_WINDOWS = platform.system() == "Windows"
MAIN_SCRIPT = "network_mapper_main.py"

# Passed to the elevated copy of this script so it never tries to elevate
# again. Without it, a sudo that doesn't really elevate would loop forever.
ELEVATED_FLAG = "--elevated"


def is_admin():
    try:
        return os.getuid() == 0
    except AttributeError:
        # Windows
        try:
            return ctypes.windll.shell32.IsUserAnAdmin() != 0
        except Exception:
            return False


def venv_python():
    if IS_WINDOWS:
        return os.path.join(ROOT, "venv", "Scripts", "python.exe")
    return os.path.join(ROOT, "venv", "bin", "python")


def run_setup():
    # Run as the current user (before elevating) so the venv folder isn't
    # owned by root. "--no-start" / "/nostart" stops the setup script from
    # asking to launch the app, since this script does that itself.
    if IS_WINDOWS:
        subprocess.call(["cmd", "/c", "windows_setup.bat", "/nostart"])
    else:
        subprocess.call(["bash", "linux_setup.sh", "--no-start"])


def relaunch_elevated():
    """Run this script again with admin rights and exit with its result.
    Returns (only) if elevation isn't available or was declined."""
    script = os.path.abspath(__file__)

    if IS_WINDOWS:
        params = subprocess.list2cmdline([script, ELEVATED_FLAG])
        # ShellExecuteW returns a value above 32 on success
        result = ctypes.windll.shell32.ShellExecuteW(None, "runas", sys.executable, params, ROOT, 1)
        if result > 32:
            sys.exit(0)
        print("Administrator rights were not granted.")
        return

    if shutil.which("sudo") is None:
        print("sudo was not found, so admin rights can't be requested.")
        return
    try:
        code = subprocess.call(["sudo", sys.executable, script, ELEVATED_FLAG])
    except KeyboardInterrupt:
        code = 130
    sys.exit(code)


def main():
    if ELEVATED_FLAG not in sys.argv:
        print("Starting Network Topology Mapper...")

    if not os.path.isfile(venv_python()):
        print("Virtual environment not found. Running setup...")
        run_setup()
        if not os.path.isfile(venv_python()):
            print("Error: setup did not complete (venv still missing)")
            sys.exit(1)

    if not os.path.isfile(MAIN_SCRIPT):
        print(f"Error: {MAIN_SCRIPT} not found")
        sys.exit(1)

    if not is_admin():
        if ELEVATED_FLAG not in sys.argv:
            relaunch_elevated()
        print("Continuing without admin rights: OS detection and SYN scans may not work.\n")

    print("Access the application at: http://localhost:5000")
    print("Press Ctrl+C to stop\n")

    try:
        code = subprocess.call([venv_python(), MAIN_SCRIPT])
    except KeyboardInterrupt:
        code = 0

    # The elevated copy on Windows runs in its own console window, which would
    # close immediately (and hide any error) once the app stops.
    if IS_WINDOWS and ELEVATED_FLAG in sys.argv:
        os.system("pause")
    sys.exit(code)


if __name__ == "__main__":
    main()
