"""Recover the playable level list and sprites from this demo's Unity 2022 build."""
from pathlib import Path
import json
import struct
import UnityPy

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "web" / "assets"


def unity_bundle(data):
    header_end, = struct.unpack_from("<I", data, 16)
    cursor = 20
    while cursor < header_end:
        start, size, length = struct.unpack_from("<III", data, cursor)
        cursor += 12
        if data[cursor:cursor + length] == b"data.unity3d":
            return data[start:start + size]
        cursor += length
    raise ValueError("data.unity3d missing")


def after_string(raw, offset):
    length, = struct.unpack_from("<I", raw, offset)
    return (offset + 4 + length + 3) & ~3


def main():
    bundle = UnityPy.load(unity_bundle((ROOT / "Build/Build.data").read_bytes()))
    levels = {}
    sprites = {
        "Empty": "empty", "Blue": "player", "Red": "computer", "Cross": "mark",
        "frame": "frame", "shape031_style01_color08": "back",
        "shape069_style01_color08": "restart", "shape001_style01_color08": "step",
        "73-01": "hint", "Free Flat Media Right Double Icon": "advance",
    }
    ASSETS.mkdir(parents=True, exist_ok=True)
    for obj in bundle.objects:
        name = obj.peek_name()
        if obj.type.name == "Sprite" and name in sprites:
            obj.read().image.save(ASSETS / (sprites[name] + ".png"))
        if obj.assets_file.name != "sharedassets0.assets" or obj.type.name != "MonoBehaviour":
            continue
        raw = obj.get_raw_data()
        pos = after_string(raw, 28)  # MonoBehaviour header, then m_Name
        if name == "Levels":
            count, = struct.unpack_from("<I", raw, pos)
            order = [struct.unpack_from("<iq", raw, pos + 4 + i * 12)[1] for i in range(count)]
        elif name and name.startswith("Level") and name[5:].isdigit():
            pos = after_string(raw, pos)  # LevelData.levelName
            w, h, count = struct.unpack_from("<III", raw, pos)
            marks = list(struct.iter_unpack("<ii", raw[pos + 12:]))
            assert len(marks) == count
            levels[obj.path_id] = dict(asset=name, width=w, height=h, marked=marks)
    output = [levels[key] for key in order]
    (ROOT / "web/levels.json").write_text(json.dumps(output, indent=2) + "\n")


if __name__ == "__main__":
    main()
