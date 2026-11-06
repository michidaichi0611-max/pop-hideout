"""art_reference/ の設定画から、試作用の軽量スプライトを切り出す。

使い方:  python tools/prepare_assets.py
出力先:  assets/  （元画像は変更しない。何度実行しても同じ結果になる）

設定画はフレーム整列済みのシートではないため、手で決めた「セル範囲」から
不透明部分の連結成分を拾い、縁の色にじみ（低アルファ）を落として保存する。
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "art_reference")
OUT = os.path.join(ROOT, "assets")


def load(name):
    return Image.open(os.path.join(SRC, name)).convert("RGBA")


def cut_sprite(img, box, max_h, alpha_cut=110, min_area=250, keep_largest=False):
    """box 内の不透明部分を切り出し、高さ max_h に縮小する。"""
    cell = np.array(img.crop(box))
    a = cell[..., 3].astype(np.int32)
    mask = a >= alpha_cut
    lab, n = ndimage.label(mask)
    if n == 0:
        raise ValueError(f"no sprite in {box}")
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    if keep_largest:
        keep = [int(np.argmax(sizes)) + 1]
    else:
        keep = [i + 1 for i, s in enumerate(sizes) if s >= min_area]
    m = np.isin(lab, keep)
    # 1px 収縮して縁の色にじみを除去、内部は不透明にする
    m = ndimage.binary_erosion(m, iterations=1)
    m = ndimage.binary_fill_holes(m)
    out = cell.copy()
    out[..., 3] = np.where(m, 255, 0)
    ys, xs = np.where(m)
    out = out[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    im = Image.fromarray(out, "RGBA")
    scale = max_h / im.height
    if scale < 1:
        im = im.resize((max(1, round(im.width * scale)), max_h), Image.LANCZOS)
    return im


def hue_to_orange(im):
    """主人公B（青）の体色だけを主人公A風のオレンジへ置き換える。"""
    hsv = np.array(im.convert("RGB").convert("HSV")).astype(np.int32)
    a = np.array(im)[..., 3]
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    blue = (h > 115) & (h < 165) & (s > 70)  # PIL の H は 0-255
    h = np.where(blue, 20, h)               # オレンジ
    s = np.where(blue, np.minimum(255, s + 20), s)
    hsv2 = np.stack([h, s, v], -1).astype(np.uint8)
    rgb = np.array(Image.fromarray(hsv2, "HSV").convert("RGB"))
    return Image.fromarray(np.dstack([rgb, a]), "RGBA")


def round_icon(img, box, size=112):
    im = img.crop(box).convert("RGBA")
    side = max(im.size)
    sq = Image.new("RGBA", (side, side), (40, 30, 25, 255))
    sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    sq = sq.resize((size, size), Image.LANCZOS)
    yy, xx = np.mgrid[:size, :size]
    r = size / 2
    circle = ((xx - r + .5) ** 2 + (yy - r + .5) ** 2) <= (r - 1) ** 2
    arr = np.array(sq)
    arr[..., 3] = np.where(circle, 255, 0)
    return Image.fromarray(arr, "RGBA")


def save(im, name):
    path = os.path.join(OUT, name)
    im.save(path, optimize=True)
    print(f"{name:18s} {im.width}x{im.height}")


def main():
    os.makedirs(OUT, exist_ok=True)

    # --- ステージ：3枚の横並びシートを白い区切り線で分割（線と縁のにじみは除く）
    sheet = Image.open(os.path.join(SRC, "stage_sheet.png")).convert("RGB")
    for i, (x0, x1) in enumerate([(0, 675), (688, 1379), (1390, 2069)]):
        p = sheet.crop((x0, 0, x1, 760))
        p.save(os.path.join(OUT, f"stage{i}.jpg"), quality=86)
        print(f"stage{i}.jpg         {p.width}x{p.height}")

    # --- 敵：走り（=通常姿勢）と被弾。行=赤/緑/青/金ボス ------------------
    en = load("enemies.png")
    rows = [(80, 372), (420, 692), (730, 1002), (1030, 1393)]
    names = ["red", "green", "blue", "boss"]
    for name, (y0, y1) in zip(names, rows):
        stand_box = (560, y0, 875, y1) if name == "boss" else (585, y0, 870, y1)
        save(cut_sprite(en, stand_box, 200, keep_largest=True), f"enemy_{name}.png")
        save(cut_sprite(en, (862, y0 - 20 if y0 > 80 else 60, 1129, y1), 200), f"enemy_{name}_hit.png")

    # --- 主人公：B の背面・走り、A は B の色替え（仮） ---------------------
    hb = load("hero_b.png")
    back = cut_sprite(hb, (440, 50, 800, 545), 260, keep_largest=True)
    run = cut_sprite(hb, (790, 560, 1160, 970), 240, keep_largest=True)
    save(back, "hero_b_back.png")
    save(run, "hero_b_run.png")
    save(hue_to_orange(back), "hero_a_back.png")
    save(hue_to_orange(run), "hero_a_run.png")

    # --- エフェクト -----------------------------------------------------
    fx = load("effects.png")
    save(cut_sprite(fx, (20, 100, 540, 450), 120, alpha_cut=90), "fx_muzzle.png")
    save(cut_sprite(fx, (1090, 40, 1520, 440), 140, alpha_cut=90), "fx_impact.png")
    save(cut_sprite(fx, (20, 600, 710, 920), 110, alpha_cut=90), "fx_stream.png")
    save(cut_sprite(fx, (715, 540, 1140, 965), 140, alpha_cut=90), "fx_splash.png")

    # --- 武器アイコン（背景つき原画を丸く切り抜き）-------------------------
    wp = load("weapons.png")
    save(round_icon(wp, (40, 0, 800, 500)), "icon_revolver.png")
    save(round_icon(wp, (10, 500, 790, 1010)), "icon_water.png")


def trim(im, alpha_cut=40):
    """画像生成した透過素材の余白とうっすら残る縁を除く。"""
    arr = np.array(im.convert("RGBA"))
    mask = arr[..., 3] >= alpha_cut
    lab, n = ndimage.label(mask)
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    keep = [i + 1 for i, s in enumerate(sizes) if s >= max(200, sizes.max() * 0.002)]
    m = np.isin(lab, keep)
    arr[..., 3] = np.where(m, arr[..., 3], 0)
    ys, xs = np.where(m)
    return Image.fromarray(arr[ys.min():ys.max() + 1, xs.min():xs.max() + 1], "RGBA")


def fit(im, max_w=None, max_h=None):
    s = min((max_w or 1e9) / im.width, (max_h or 1e9) / im.height, 1)
    return im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS) if s < 1 else im


def muzzle_of(im):
    """構えポーズの青い銃の先端（右上の端）を画像比率で返す。"""
    hsv = np.array(im.convert("RGB").convert("HSV")).astype(int)
    a = np.array(im)[..., 3]
    gun = (hsv[..., 0] > 140) & (hsv[..., 0] < 175) & (hsv[..., 1] > 120) & (a > 128)
    ys, xs = np.where(gun)
    right = xs >= np.percentile(xs, 95)
    return round(xs[right].mean() / im.width, 3), round(ys[right].mean() / im.height, 3)


def new_art():
    """art_new/（画像生成した追加素材）があれば assets/ へ書き出す。"""
    src = os.path.join(ROOT, "art_new")
    if not os.path.isdir(src):
        return
    def get(name):
        path = os.path.join(src, name)
        return Image.open(path) if os.path.exists(path) else None
    for hid in ("a", "b"):
        im = get(f"hero_{hid}_back_aim.png")
        if im:
            im = fit(trim(im), max_h=360)
            save(im, f"hero_{hid}_aim.png")
            print("   muzzle", hid, muzzle_of(im))
    im = get("hero_a_run.png")
    if im:
        save(fit(trim(im), max_h=240), "hero_a_run.png")
    im = get("logo.png")
    if im:
        save(fit(trim(im), max_w=640), "logo.png")
    im = get("wanted.png")
    if im:
        save(fit(trim(im), max_w=340), "wanted.png")


SHEETS = [
    # (ファイル, 列, 行, 書き出し名, 高さ)
    ("enemy_red.png", 4, 2, ["enemy_red_" + n for n in ("idle", "look", "blink", "surprised", "taunt", "run1", "run2", "run3")], 220),
    ("enemy_green.png", 4, 2, ["enemy_green_" + n for n in ("idle", "look", "blink", "surprised", "taunt", "run1", "run2", "run3")], 220),
    ("enemy_blue.png", 4, 2, ["enemy_blue_" + n for n in ("idle", "look", "blink", "surprised", "taunt", "run1", "run2", "run3")], 220),
    ("enemy_boss.png", 4, 2, ["enemy_boss_" + n for n in ("idle", "look", "blink", "surprised", "taunt", "run1", "run2", "run3")], 220),
    ("civilians.png", 3, 2, ["lady_idle", "lady_walk", "lady_hit", "chicken_idle", "chicken_run", "chicken_hit"], 200),
    ("hero_a_poses.png", 3, 1, ["hero_a_shoot", "hero_a_win", "hero_a_lose"], 360),
    ("hero_b_poses.png", 3, 1, ["hero_b_shoot", "hero_b_win", "hero_b_lose"], 360),
    ("props.png", 3, 1, ["prop_tumble", "prop_crow1", "prop_crow2"], 120),
    ("enemy_gold.png", 4, 2, ["enemy_gold_" + n for n in ("idle", "look", "blink", "surprised", "taunt", "run1", "run2", "run3")], 220),
    ("enemy_bomber.png", 4, 2, ["enemy_bomber_" + n for n in ("idle", "look", "blink", "surprised", "taunt", "run1", "run2", "run3")], 220),
    ("enemy_balloon.png", 2, 1, ["enemy_balloon", "enemy_balloon_hit"], 300),
    ("enemy_jumper.png", 3, 2, ["enemy_jumper_crouch", "enemy_jumper_jump", "enemy_jumper_air", "enemy_jumper_fall", "enemy_jumper_hit", "enemy_jumper_land"], 220),
]

# エフェクト素材（art_new/fx）：(ファイル, 列, 行, 書き出し名, 高さ, シート内で大きさをそろえるか)
FX_SHEETS = [
    ("explosion_sheet.png", 4, 2, [f"fx_boom_{i}" for i in range(1, 9)], 200, True),
    ("comic_words.png", 2, 2, ["word_bang", "word_jackpot", "word_fever", "word_perfect"], 170, False),
    ("cutins.png", 2, 1, ["cutin_a", "cutin_b"], 420, False),
    ("sky_targets.png", 3, 2, ["target_bottle", "target_can", "target_gold", "target_bottle_broken", "target_can_broken", "target_gold_broken"], 130, False),
]


def fx_sheets():
    src = os.path.join(ROOT, "art_new", "fx")
    if not os.path.isdir(src):
        return
    for fname, cols, rows, names, h, same in FX_SHEETS:
        path = os.path.join(src, fname)
        if not os.path.exists(path):
            continue
        parts = slice_sheet(Image.open(path), cols, rows, alpha_cut=40)
        k = min(1.0, h / max(p_.height for p_ in parts if p_ is not None))
        for name, part in zip(names, parts):
            if part is None:
                print("   (missing)", name)
                continue
            im = part.resize((max(1, round(part.width * k)), max(1, round(part.height * k))), Image.LANCZOS) if same and k < 1 else fit(part, max_h=h)
            save(im, name + ".png")
    # 金ピカ・爆弾魔の基準の絵＝待機コマ、被弾の絵＝驚いたコマ
    for t in ("gold", "bomber"):
        ip = os.path.join(OUT, f"enemy_{t}_idle.png")
        if os.path.exists(ip):
            Image.open(ip).save(os.path.join(OUT, f"enemy_{t}.png"))
            Image.open(os.path.join(OUT, f"enemy_{t}_surprised.png")).save(os.path.join(OUT, f"enemy_{t}_hit.png"))
    # 跳ね屋の基準の絵（大きさの基準）＝跳んでいるコマ
    jp = os.path.join(OUT, "enemy_jumper_jump.png")
    if os.path.exists(jp):
        Image.open(jp).save(os.path.join(OUT, "enemy_jumper.png"))


def slice_sheet(im, cols, rows, alpha_cut=60):
    """格子に並んだポーズを切り出す。部品（汗・星など）は一番近いセルにまとめる。"""
    arr = np.array(im.convert("RGBA"))
    H, W = arr.shape[:2]
    mask = arr[..., 3] >= alpha_cut
    lab, n = ndimage.label(mask)
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    coms = ndimage.center_of_mass(mask, lab, range(1, n + 1))
    cells = [[] for _ in range(cols * rows)]
    for i, (sz, (cy, cx)) in enumerate(zip(sizes, coms)):
        if sz < 120:
            continue
        c = min(cols - 1, int(cx / (W / cols)))
        r = min(rows - 1, int(cy / (H / rows)))
        cells[r * cols + c].append(i + 1)
    out = []
    for ids in cells:
        if not ids:
            out.append(None)
            continue
        m = np.isin(lab, ids)
        m = ndimage.binary_erosion(m, iterations=1)
        a2 = arr.copy()
        a2[..., 3] = np.where(m, np.maximum(arr[..., 3], 0), 0)
        ys, xs = np.where(m)
        out.append(Image.fromarray(a2[ys.min():ys.max() + 1, xs.min():xs.max() + 1], "RGBA"))
    return out


def sheets():
    src = os.path.join(ROOT, "art_new", "sheets")
    if not os.path.isdir(src):
        return
    for fname, cols, rows, names, h in SHEETS:
        path = os.path.join(src, fname)
        if not os.path.exists(path):
            continue
        parts = slice_sheet(Image.open(path), cols, rows)
        # 同じシートのコマは同じ倍率で縮める（コマ同士の大きさ関係を保つ）
        k = min(1.0, h / max(p_.height for p_ in parts if p_ is not None))
        for name, part in zip(names, parts):
            if part is None:
                print("   (missing)", name)
                continue
            im = part.resize((max(1, round(part.width * k)), max(1, round(part.height * k))), Image.LANCZOS) if k < 1 else part
            save(im, name + ".png")


def hat_width(im):
    """帽子（茶色）の最大幅。コマごとの大きさをそろえる物差しにする。"""
    a = np.array(im.convert("RGBA"))
    hsv = np.array(im.convert("RGB").convert("HSV")).astype(int)
    h, s_, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    brown = (h >= 5) & (h <= 24) & (s_ > 90) & (v > 50) & (v < 200) & (a[..., 3] > 128)
    top = brown[: int(im.height * 0.6)]
    rows = top.sum(axis=1)
    return float(np.percentile(rows[rows > 0], 95)) if rows.any() else None


FRONT = ("idle", "look", "blink", "surprised", "taunt")


def frame_info():
    """敵のコマの大きさ（基準の 1 枚絵に対する高さの比）と、上端・下端どちらでそろえるか。"""
    import json
    info = {}
    for t in ("red", "green", "blue", "boss"):
        base_p = os.path.join(OUT, f"enemy_{t}.png")
        if not os.path.exists(base_p):
            continue
        base = Image.open(base_p)
        hb = hat_width(base)
        if not hb:
            continue
        idle_p = os.path.join(OUT, f"enemy_{t}_idle.png")
        if not os.path.exists(idle_p):
            continue
        idle = Image.open(idle_p)
        hf = hat_width(idle)
        # 正面の待機コマの帽子の幅が基準の絵と同じになる倍率。他のコマはシート上の大きさの比で決める
        s_idle = (hb / base.height) / (hf / idle.height)
        for n in FRONT + ("run1", "run2", "run3"):
            fp = os.path.join(OUT, f"enemy_{t}_{n}.png")
            if not os.path.exists(fp):
                continue
            im = Image.open(fp)
            scale = s_idle * im.height / idle.height
            info[f"enemy_{t}_{n}"] = {"scale": round(scale, 3), "align": "top" if n in FRONT else "bottom"}
    # 金ピカ・爆弾魔：全身のコマなので足元をそろえる
    for t in ("gold", "bomber"):
        bp = os.path.join(OUT, f"enemy_{t}.png")
        if os.path.exists(bp):
            bh = Image.open(bp).height
            for n in ("idle", "look", "blink", "surprised", "taunt", "run1", "run2", "run3"):
                fp_ = os.path.join(OUT, f"enemy_{t}_{n}.png")
                if os.path.exists(fp_):
                    info[f"enemy_{t}_{n}"] = {"scale": round(Image.open(fp_).height / bh, 3), "align": "bottom"}
    # 跳ね屋：シート上の大きさの比で、足元をそろえる
    base_p = os.path.join(OUT, "enemy_jumper.png")
    if os.path.exists(base_p):
        bh = Image.open(base_p).height
        for n in ("crouch", "jump", "air", "fall", "land"):
            fp_ = os.path.join(OUT, f"enemy_jumper_{n}.png")
            if os.path.exists(fp_):
                info[f"enemy_jumper_{n}"] = {"scale": round(Image.open(fp_).height / bh, 3), "align": "bottom"}
    with open(os.path.join(OUT, "frames.json"), "w", encoding="utf8") as fp:
        json.dump(info, fp, indent=1)
    print(f"frames.json        {len(info)} frames")


NEW_STAGES = [("A_main_street_final.png", "stage3.jpg"), ("B_mine_final.png", "stage4.jpg"), ("C_station_final.png", "stage5.jpg"),
              # 元の 3 ステージに中央の障害物を足した版（あれば stage_sheet からの切り出しを上書き）
              ("old0_final.png", "stage0.jpg"), ("old1_final.png", "stage1.jpg"), ("old2_final.png", "stage2.jpg")]


def new_stages():
    """画像生成した追加ステージ（正方形）を、既存ステージと同じ縦横比 678x760 に中央で切り抜く。"""
    src = os.path.join(ROOT, "art_new", "stage_concepts")
    for fin, out in NEW_STAGES:
        path = os.path.join(src, fin)
        if not os.path.exists(path):
            continue
        im = Image.open(path).convert("RGB")
        target = 678 / 760
        w = round(im.height * target)
        x0 = (im.width - w) // 2
        im = im.crop((x0, 0, x0 + w, im.height)).resize((678, 760), Image.LANCZOS)
        im.save(os.path.join(OUT, out), quality=86)
        print(f"{out:18s} 678x760 (from {fin})")


def tall_stages():
    """縦長に描き直した背景（art_new/tall/stageN.png, 2:3）を幅 678 にそろえて書き出す（あれば最優先）。"""
    src = os.path.join(ROOT, "art_new", "tall")
    if not os.path.isdir(src):
        return
    for i in range(8):
        path = os.path.join(src, f"stage{i}.png")
        if not os.path.exists(path):
            continue
        im = Image.open(path).convert("RGB")
        h = round(678 * im.height / im.width)
        im.resize((678, h), Image.LANCZOS).save(os.path.join(OUT, f"stage{i}.jpg"), quality=86)
        print(f"stage{i}.jpg         678x{h} (tall)")


HAT_COLORS = ("hat_black", "hat_white", "hat_red")


def hat_mask(im, hero):
    """帽子の部分（いちばん上にある茶色／ベージュのかたまり）。ベルトや靴は除く。"""
    arr = np.array(im.convert("RGBA"))
    hsv = np.array(im.convert("RGB").convert("HSV")).astype(int)
    h, s_, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    opaque = arr[..., 3] > 100
    brown = (h >= 3) & (h <= 26) & (s_ >= 40) & (s_ <= 228) & (v >= 30) & (v <= 228)  # 帽子のハイライトも含める（体のオレンジは彩度が高いので除外）
    if hero == "b":
        beige = (h >= 10) & (h <= 36) & (s_ >= 40) & (s_ <= 150) & (v >= 150)
        cand = (brown | beige) & opaque
    else:
        cand = brown & opaque
    lab, n = ndimage.label(cand)
    if n == 0:
        return np.zeros(cand.shape, bool)
    H = cand.shape[0]
    keep = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        size = (lab[sl] == i).sum()
        if sl[0].start < H * 0.22 and size > cand.sum() * 0.05:
            keep.append(i)
    m = np.isin(lab, keep)
    return ndimage.binary_closing(m, iterations=2) & opaque


def recolor_hat(im, mask, color):
    hsv = np.array(im.convert("RGB").convert("HSV")).astype(float)
    h, s_, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    if color == "hat_black":
        v2 = v * 0.32 + 12; s2 = s_ * 0.25; h2 = h
    elif color == "hat_white":
        v2 = 175 + v * 0.3; s2 = s_ * 0.12; h2 = h
    else:  # 赤
        h2 = np.zeros_like(h); s2 = np.maximum(s_, 175); v2 = np.clip(v * 1.15 + 20, 0, 255)
    hsv[..., 0] = np.where(mask, h2, h); hsv[..., 1] = np.where(mask, np.clip(s2, 0, 255), s_); hsv[..., 2] = np.where(mask, np.clip(v2, 0, 255), v)
    rgb = np.array(Image.fromarray(hsv.astype(np.uint8), "HSV").convert("RGB"))
    a = np.array(im.convert("RGBA"))[..., 3]
    return Image.fromarray(np.dstack([rgb, a]), "RGBA")


def hat_variants():
    """主人公の帽子の色違い（ログインボーナス・ショップの見た目）。"""
    for hero in ("a", "b"):
        names = [f"hero_{hero}_{k}" for k in ("aim", "shoot", "run", "win", "lose")] + [f"cutin_{hero}"]
        for name in names:
            path = os.path.join(OUT, name + ".png")
            if not os.path.exists(path):
                continue
            im = Image.open(path).convert("RGBA")
            m = hat_mask(im, hero)
            for c in HAT_COLORS:
                recolor_hat(im, m, c).save(os.path.join(OUT, f"{name}_{c}.png"), optimize=True)
    print("hat variants       done")


def write_list():
    """ゲームが読み込む素材の一覧（無い素材を読みに行かないため）。"""
    import json
    names = sorted(f for f in os.listdir(OUT) if f.endswith(".png"))
    with open(os.path.join(OUT, "list.json"), "w", encoding="utf8") as fp:
        json.dump(names, fp, ensure_ascii=False, indent=0)
    # index.html を直接開いた時（file://）は JSON を読めないので、同じ内容を JS でも書き出す
    with open(os.path.join(OUT, "frames.json"), encoding="utf8") as fp:
        frames = fp.read()
    with open(os.path.join(OUT, "data.js"), "w", encoding="utf8") as fp:
        fp.write("window.PH_ASSET_LIST = " + json.dumps(names) + ";\nwindow.PH_FRAMES = " + frames + ";\n")
    print(f"list.json          {len(names)} files")


if __name__ == "__main__":
    main()
    new_art()
    sheets()
    fx_sheets()
    new_stages()
    tall_stages()
    hat_variants()
    frame_info()
    write_list()
    sys.exit(0)
