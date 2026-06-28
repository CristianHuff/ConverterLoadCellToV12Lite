#!/usr/bin/env python3
"""
Read a Windows joystick device and send pedal percentages to the Arduino serial
pedal bridge.

No Python packages are required. On Windows this uses winmm's joystick API and
the built-in "mode" command to configure the serial port.

Arduino serial protocol:
    clutch,brake,throttle\n
Example:
    0,12,47
"""

from __future__ import annotations

import argparse
import ctypes
import os
import subprocess
import sys
import time
from ctypes import wintypes


JOY_RETURNX = 0x00000001
JOY_RETURNY = 0x00000002
JOY_RETURNZ = 0x00000004
JOY_RETURNR = 0x00000008
JOY_RETURNU = 0x00000010
JOY_RETURNV = 0x00000020
JOY_RETURNPOV = 0x00000040
JOY_RETURNBUTTONS = 0x00000080
JOY_RETURNALL = (
    JOY_RETURNX
    | JOY_RETURNY
    | JOY_RETURNZ
    | JOY_RETURNR
    | JOY_RETURNU
    | JOY_RETURNV
    | JOY_RETURNPOV
    | JOY_RETURNBUTTONS
)
JOYERR_NOERROR = 0


class JOYINFOEX(ctypes.Structure):
    _fields_ = [
        ("dwSize", wintypes.DWORD),
        ("dwFlags", wintypes.DWORD),
        ("dwXpos", wintypes.DWORD),
        ("dwYpos", wintypes.DWORD),
        ("dwZpos", wintypes.DWORD),
        ("dwRpos", wintypes.DWORD),
        ("dwUpos", wintypes.DWORD),
        ("dwVpos", wintypes.DWORD),
        ("dwButtons", wintypes.DWORD),
        ("dwButtonNumber", wintypes.DWORD),
        ("dwPOV", wintypes.DWORD),
        ("dwReserved1", wintypes.DWORD),
        ("dwReserved2", wintypes.DWORD),
    ]


class JOYCAPSW(ctypes.Structure):
    _fields_ = [
        ("wMid", wintypes.WORD),
        ("wPid", wintypes.WORD),
        ("szPname", wintypes.WCHAR * 32),
        ("wXmin", wintypes.UINT),
        ("wXmax", wintypes.UINT),
        ("wYmin", wintypes.UINT),
        ("wYmax", wintypes.UINT),
        ("wZmin", wintypes.UINT),
        ("wZmax", wintypes.UINT),
        ("wNumButtons", wintypes.UINT),
        ("wPeriodMin", wintypes.UINT),
        ("wPeriodMax", wintypes.UINT),
        ("wRmin", wintypes.UINT),
        ("wRmax", wintypes.UINT),
        ("wUmin", wintypes.UINT),
        ("wUmax", wintypes.UINT),
        ("wVmin", wintypes.UINT),
        ("wVmax", wintypes.UINT),
        ("wCaps", wintypes.UINT),
        ("wMaxAxes", wintypes.UINT),
        ("wNumAxes", wintypes.UINT),
        ("wMaxButtons", wintypes.UINT),
        ("szRegKey", wintypes.WCHAR * 32),
        ("szOEMVxD", wintypes.WCHAR * 260),
    ]


AXIS_FIELDS = {
    "x": "dwXpos",
    "y": "dwYpos",
    "z": "dwZpos",
    "r": "dwRpos",
    "u": "dwUpos",
    "v": "dwVpos",
}


def require_windows() -> None:
    if os.name != "nt":
        raise SystemExit("This helper currently supports Windows only.")


def read_joystick(winmm: ctypes.WinDLL, joystick_id: int) -> JOYINFOEX:
    info = JOYINFOEX()
    info.dwSize = ctypes.sizeof(JOYINFOEX)
    info.dwFlags = JOY_RETURNALL
    result = winmm.joyGetPosEx(joystick_id, ctypes.byref(info))
    if result != JOYERR_NOERROR:
        raise RuntimeError(f"joyGetPosEx({joystick_id}) failed with code {result}")
    return info


def get_joystick_name(winmm: ctypes.WinDLL, joystick_id: int) -> str:
    caps = JOYCAPSW()
    result = winmm.joyGetDevCapsW(joystick_id, ctypes.byref(caps), ctypes.sizeof(caps))
    if result != JOYERR_NOERROR:
        return "unknown"
    return caps.szPname


def list_joysticks() -> None:
    require_windows()
    winmm = ctypes.WinDLL("winmm")
    count = winmm.joyGetNumDevs()
    print(f"Detected joystick slots: {count}")
    for joystick_id in range(count):
        try:
            info = read_joystick(winmm, joystick_id)
        except RuntimeError:
            continue
        axes = " ".join(f"{axis.upper()}={getattr(info, field)}" for axis, field in AXIS_FIELDS.items())
        print(f"{joystick_id}: {get_joystick_name(winmm, joystick_id)} | {axes}")


def normalize_axis(value: int, minimum: int, maximum: int, invert: bool) -> int:
    if maximum == minimum:
        return 0
    pct = (value - minimum) * 100.0 / (maximum - minimum)
    if invert:
        pct = 100.0 - pct
    if pct < 0:
        pct = 0
    if pct > 100:
        pct = 100
    return int(round(pct))


def axis_value(info: JOYINFOEX, axis: str) -> int:
    return int(getattr(info, AXIS_FIELDS[axis]))


def serial_name(port: str) -> str:
    if port.startswith("\\\\.\\"):
        return port
    return "\\\\.\\" + port


def open_serial(port: str, baud: int):
    if os.name == "nt":
        mode_cmd = f"mode {port}: BAUD={baud} PARITY=N DATA=8 STOP=1"
        subprocess.run(mode_cmd, shell=True, check=True, stdout=subprocess.DEVNULL)
        return open(serial_name(port), "wb", buffering=0)

    return open(port, "wb", buffering=0)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Send Sim Ruito/joystick pedal axes to Arduino serial bridge.")
    parser.add_argument("--list", action="store_true", help="List active joystick devices and current raw axes.")
    parser.add_argument("--port", help="Arduino serial port, for example COM7.")
    parser.add_argument("--baud", type=int, default=115200, help="Serial baud rate.")
    parser.add_argument("--joystick", type=int, default=0, help="Windows joystick id.")
    parser.add_argument("--rate", type=float, default=50.0, help="Send rate in Hz.")
    parser.add_argument("--monitor", action="store_true", help="Print raw axes and sent percentages.")

    parser.add_argument("--brake-axis", choices=AXIS_FIELDS.keys(), default="y")
    parser.add_argument("--throttle-axis", choices=AXIS_FIELDS.keys(), default="z")
    parser.add_argument("--clutch-axis", choices=AXIS_FIELDS.keys(), default="x")

    parser.add_argument("--brake-min", type=int, default=0)
    parser.add_argument("--brake-max", type=int, default=65535)
    parser.add_argument("--throttle-min", type=int, default=0)
    parser.add_argument("--throttle-max", type=int, default=65535)
    parser.add_argument("--clutch-min", type=int, default=0)
    parser.add_argument("--clutch-max", type=int, default=65535)

    parser.add_argument("--invert-brake", action="store_true")
    parser.add_argument("--invert-throttle", action="store_true")
    parser.add_argument("--invert-clutch", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args()

    if args.list:
        list_joysticks()
        return 0

    if not args.port:
        raise SystemExit("--port is required unless --list is used.")
    if args.rate <= 0:
        raise SystemExit("--rate must be greater than zero.")

    require_windows()
    winmm = ctypes.WinDLL("winmm")
    period = 1.0 / args.rate

    print(f"Using joystick {args.joystick}: {get_joystick_name(winmm, args.joystick)}")
    print(f"Opening Arduino serial port {args.port} at {args.baud} baud")

    with open_serial(args.port, args.baud) as serial:
        last_line = b""
        last_send = 0.0
        while True:
            start = time.perf_counter()
            info = read_joystick(winmm, args.joystick)

            brake_raw = axis_value(info, args.brake_axis)
            throttle_raw = axis_value(info, args.throttle_axis)
            clutch_raw = axis_value(info, args.clutch_axis)

            brake = normalize_axis(brake_raw, args.brake_min, args.brake_max, args.invert_brake)
            throttle = normalize_axis(throttle_raw, args.throttle_min, args.throttle_max, args.invert_throttle)
            clutch = normalize_axis(clutch_raw, args.clutch_min, args.clutch_max, args.invert_clutch)

            line = f"{clutch},{brake},{throttle}\n".encode("ascii")
            now = time.perf_counter()
            if line != last_line or (now - last_send) >= 0.5:
                serial.write(line)
                last_line = line
                last_send = now

            if args.monitor:
                print(
                    f"raw B={brake_raw:5d} T={throttle_raw:5d} C={clutch_raw:5d} "
                    f"=> send {clutch:3d},{brake:3d},{throttle:3d}",
                    end="\r",
                    flush=True,
                )

            elapsed = time.perf_counter() - start
            if elapsed < period:
                time.sleep(period - elapsed)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nStopped.")
