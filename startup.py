import os
import sys
import ctypes
import platform
import subprocess

def is_admin():
    try:
        return os.getuid() == 0
    except AttributeError:
        # Windows
        try:
            return ctypes.windll.shell32.IsUserAnAdmin() != 0
        except Exception:
            return False

def run_as_admin():
    if platform.system() == "Windows" and not is_admin():
        params = " ".join(f'"{arg}"' for arg in sys.argv)
        ctypes.windll.shell32.ShellExecuteW(
            None, "runas", sys.executable, params, None, 1
        )
        sys.exit()
    elif platform.system() != "Windows" and not is_admin():
        subprocess.call(['sudo', sys.executable] + sys.argv)
        sys.exit()

# --- Main ---
run_as_admin()

print("Starting Network Topology Mapper...")

if not os.path.isdir("venv"):
    print("Virtual environment not found. Running setup...")
    if platform.system() == "Windows":
        subprocess.call(["windows_setup.bat"], shell=True)
    else:
        subprocess.call(["bash", "linux_setup.sh"])

    if not os.path.isdir("venv"):
        print("Error: setup did not complete (venv still missing)")
        sys.exit(1)

    # The setup script offers to launch the app itself; if the user accepted
    # that prompt it's already running and Ctrl+C exits this too. If they
    # declined, fall through and start it here instead of silently quitting.

if not os.path.isfile("network_mapper_main.py"):
    print("Error: network_mapper_main.py not found")
    sys.exit(1)

print("Access the application at: http://localhost:5000")
print("Press Ctrl+C to stop\n")

if platform.system() == "Windows":
    python_exec = os.path.join("venv", "Scripts", "python.exe")
else:
    python_exec = os.path.join("venv", "bin", "python")

subprocess.call([python_exec, "network_mapper_main.py"])
