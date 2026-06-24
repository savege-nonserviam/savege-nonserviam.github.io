import ctypes
import time
from ctypes import wintypes
from pathlib import Path

from PIL import ImageGrab


USER32 = ctypes.WinDLL("user32", use_last_error=True)

SW_MAXIMIZE = 3
VK_ESCAPE = 0x1B
VK_SPACE = 0x20
VK_SHIFT = 0x10
VK_CONTROL = 0x11
VK_1 = 0x31
VK_2 = 0x32
VK_3 = 0x33
VK_4 = 0x34
VK_5 = 0x35
VK_6 = 0x36
VK_7 = 0x37
VK_8 = 0x38
VK_9 = 0x39
VK_W = 0x57
VK_A = 0x41
VK_S = 0x53
VK_D = 0x44
VK_E = 0x45
VK_Q = 0x51

INPUT_KEYBOARD = 1
INPUT_MOUSE = 0
KEYEVENTF_KEYUP = 0x0002
MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_RIGHTDOWN = 0x0008
MOUSEEVENTF_RIGHTUP = 0x0010


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", wintypes.WORD),
        ("wScan", wintypes.WORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
    ]


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", wintypes.LONG),
        ("dy", wintypes.LONG),
        ("mouseData", wintypes.DWORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
    ]


class INPUTUNION(ctypes.Union):
    _fields_ = [("ki", KEYBDINPUT), ("mi", MOUSEINPUT)]


class INPUT(ctypes.Structure):
    _fields_ = [("type", wintypes.DWORD), ("union", INPUTUNION)]


def send_input(item):
    sent = USER32.SendInput(1, ctypes.byref(item), ctypes.sizeof(INPUT))
    if sent != 1:
        raise ctypes.WinError(ctypes.get_last_error())


def key_down(vk):
    send_input(INPUT(INPUT_KEYBOARD, INPUTUNION(ki=KEYBDINPUT(vk, 0, 0, 0, None))))


def key_up(vk):
    send_input(INPUT(INPUT_KEYBOARD, INPUTUNION(ki=KEYBDINPUT(vk, 0, KEYEVENTF_KEYUP, 0, None))))


def tap(vk, seconds=0.05):
    key_down(vk)
    time.sleep(seconds)
    key_up(vk)


def mouse_move(dx, dy):
    send_input(INPUT(INPUT_MOUSE, INPUTUNION(mi=MOUSEINPUT(dx, dy, 0, MOUSEEVENTF_MOVE, 0, None))))


def mouse_down():
    send_input(INPUT(INPUT_MOUSE, INPUTUNION(mi=MOUSEINPUT(0, 0, 0, MOUSEEVENTF_LEFTDOWN, 0, None))))


def mouse_up():
    send_input(INPUT(INPUT_MOUSE, INPUTUNION(mi=MOUSEINPUT(0, 0, 0, MOUSEEVENTF_LEFTUP, 0, None))))


def right_down():
    send_input(INPUT(INPUT_MOUSE, INPUTUNION(mi=MOUSEINPUT(0, 0, 0, MOUSEEVENTF_RIGHTDOWN, 0, None))))


def right_up():
    send_input(INPUT(INPUT_MOUSE, INPUTUNION(mi=MOUSEINPUT(0, 0, 0, MOUSEEVENTF_RIGHTUP, 0, None))))


def hold(vks, seconds):
    for vk in vks:
        key_down(vk)
    time.sleep(seconds)
    for vk in reversed(vks):
        key_up(vk)


def walk(seconds, *, sprint=False, jump=False, strafe=None):
    keys = [VK_W]
    if sprint:
        keys.append(VK_CONTROL)
    if jump:
        keys.append(VK_SPACE)
    if strafe == "left":
        keys.append(VK_A)
    elif strafe == "right":
        keys.append(VK_D)
    hold(keys, seconds)


def attack(seconds):
    mouse_down()
    time.sleep(seconds)
    mouse_up()


def use(seconds=0.15):
    right_down()
    time.sleep(seconds)
    right_up()


def look(dx=0, dy=0, steps=1, delay=0.03):
    step_x = int(dx / steps) if steps else dx
    step_y = int(dy / steps) if steps else dy
    for _ in range(max(1, steps)):
        mouse_move(step_x, step_y)
        time.sleep(delay)


def enum_windows():
    windows = []

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def callback(hwnd, _):
        if not USER32.IsWindowVisible(hwnd):
            return True
        length = USER32.GetWindowTextLengthW(hwnd)
        if length == 0:
            return True
        title = ctypes.create_unicode_buffer(length + 1)
        USER32.GetWindowTextW(hwnd, title, length + 1)
        windows.append((hwnd, title.value))
        return True

    USER32.EnumWindows(callback, 0)
    return windows


def find_minecraft():
    for hwnd, title in enum_windows():
        if "Minecraft" in title and "Singleplayer" in title:
            return hwnd, title
    raise RuntimeError("Minecraft singleplayer window not found")


def focus_minecraft():
    hwnd, title = find_minecraft()
    USER32.ShowWindow(hwnd, SW_MAXIMIZE)
    time.sleep(0.4)
    USER32.SetForegroundWindow(hwnd)
    time.sleep(0.4)
    return hwnd, title


def screenshot(name):
    out = Path("mc_screens")
    out.mkdir(exist_ok=True)
    path = out / name
    ImageGrab.grab().save(path)
    return path


def release_all():
    for vk in (
        VK_W,
        VK_A,
        VK_S,
        VK_D,
        VK_SPACE,
        VK_SHIFT,
        VK_CONTROL,
        VK_ESCAPE,
        VK_E,
        VK_Q,
        VK_1,
        VK_2,
        VK_3,
        VK_4,
        VK_5,
        VK_6,
        VK_7,
        VK_8,
        VK_9,
    ):
        key_up(vk)
    mouse_up()
    right_up()


def main():
    focus_minecraft()
    screenshot("00_start.png")

    # Close the pause menu if it is up.
    tap(VK_ESCAPE, 0.08)
    time.sleep(0.5)

    # Recover from looking at the sky, then approach the visible tree line.
    mouse_move(0, 380)
    time.sleep(0.2)
    mouse_move(180, 0)
    hold([VK_W], 3.0)
    screenshot("01_approach.png")

    # Nudge toward the nearest trunk and mine. This uses real mouse hold,
    # which the desktop-control API could not provide.
    mouse_move(80, 40)
    hold([VK_W], 1.6)
    mouse_down()
    time.sleep(5.2)
    mouse_up()
    screenshot("02_mine_attempt.png")

    # Try a second nearby block, then collect drops by stepping forward.
    mouse_move(-20, -70)
    mouse_down()
    time.sleep(5.2)
    mouse_up()
    hold([VK_W], 0.8)
    screenshot("03_after_mining.png")

    release_all()


if __name__ == "__main__":
    try:
        main()
    finally:
        release_all()
