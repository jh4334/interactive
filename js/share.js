/* ============================================================
 * 우리들의 육아 이야기 — 결과 카드(공유 이미지) 생성 모듈
 *
 * window.ShareCard = {
 *   render(data) -> HTMLCanvasElement (1080×1350)
 *   download(canvas, filename)
 *   canWebShare() -> boolean
 *   share(canvas)
 * }
 *
 * data 는 app.js 가 이미 완성한 문자열로 전달한다 (조사/치환 처리 완료).
 *   { eyebrow, traitEmoji, traitName, traitDesc, secondLine|null,
 *     matchPct, matchLine, appTitle }
 *
 * 외부 라이브러리·폰트·네트워크 요청 없음. 캔버스는 다크 모드와 무관하게
 * 항상 고정 라이트 톤(앱 팔레트)으로 그린다.
 * ============================================================ */

window.ShareCard = (function () {
  "use strict";

  /* ---------------- 상수 ---------------- */

  const W = 1080;
  const H = 1350;
  const PAD = 72;                       // 카드 여백 (상하좌우)
  const CARD_R = 48;                    // 카드 모서리 반경
  const BAND_H = 420;                   // 헤더 밴드 높이

  const C = {
    bg: "#faf6f0",
    card: "#ffffff",
    accentSoft: "#fdeee5",
    ink: "#2b2723",
    ink2: "#6b625a",
    ink3: "#99908a",
    accent: "#e8794a",
    vizSeries: "#2a78d6",
    vizTrack: "#f0efec",
    shadow: "rgba(43, 39, 35, 0.12)",
  };

  const STACK = '-apple-system, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  const font = (spec) => spec + " " + STACK;

  const BAR_X = 140;
  const BAR_W = 760;
  const BAR_H = 20;
  const BAR_R = 10;

  /* ---------------- 캔버스 헬퍼 ---------------- */

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.arcTo(x + w, y, x + w, y + rr, rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
    ctx.lineTo(x + rr, y + h);
    ctx.arcTo(x, y + h, x, y + h - rr, rr);
    ctx.lineTo(x, y + rr);
    ctx.arcTo(x, y, x + rr, y, rr);
    ctx.closePath();
  }

  // 단어 단위 줄바꿈. 한 단어가 maxWidth 를 넘으면 글자 단위로 쪼갠다.
  function wrap(ctx, text, maxWidth, maxLines) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";

    const pushChars = (word) => {
      let cur = "";
      for (const ch of word) {
        if (cur && ctx.measureText(cur + ch).width > maxWidth) {
          lines.push(cur);
          cur = ch;
        } else {
          cur += ch;
        }
      }
      return cur;
    };

    for (const w of words) {
      const cand = line ? line + " " + w : w;
      if (ctx.measureText(cand).width <= maxWidth) {
        line = cand;
        continue;
      }
      if (line) lines.push(line);
      line = ctx.measureText(w).width > maxWidth ? pushChars(w) : w;
    }
    if (line) lines.push(line);

    if (maxLines && lines.length > maxLines) {
      const kept = lines.slice(0, maxLines);
      let last = kept[maxLines - 1];
      while (last.length > 1 && ctx.measureText(last + "…").width > maxWidth) {
        last = last.slice(0, -1);
      }
      kept[maxLines - 1] = last + "…";
      return kept;
    }
    return lines;
  }

  function centerText(ctx, text, y, spec, color) {
    ctx.font = font(spec);
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(text, W / 2, y);
  }

  /* ---------------- 렌더 ---------------- */

  function render(data) {
    const d = data || {};
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.textBaseline = "alphabetic";

    // 배경
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // 카드 (그림자 포함)
    const cx = PAD;
    const cy = PAD;
    const cw = W - PAD * 2;
    const chh = H - PAD * 2;

    ctx.save();
    ctx.shadowColor = C.shadow;
    ctx.shadowBlur = 60;
    ctx.shadowOffsetY = 18;
    ctx.fillStyle = C.card;
    roundRect(ctx, cx, cy, cw, chh, CARD_R);
    ctx.fill();
    ctx.restore();

    // 헤더 밴드 (카드 라운드에 맞춰 클리핑)
    ctx.save();
    roundRect(ctx, cx, cy, cw, chh, CARD_R);
    ctx.clip();
    const grad = ctx.createLinearGradient(0, cy, 0, cy + BAND_H);
    grad.addColorStop(0, C.accentSoft);
    grad.addColorStop(1, C.bg);
    ctx.fillStyle = grad;
    ctx.fillRect(cx, cy, cw, BAND_H);
    ctx.restore();

    // 성향 이모지
    ctx.save();
    ctx.font = font("180px");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = C.ink;
    ctx.fillText(d.traitEmoji || "🍼", W / 2, cy + BAND_H / 2);
    ctx.restore();

    // 본문
    let y = 560;

    if (d.eyebrow) {
      centerText(ctx, d.eyebrow, y, "36px", C.ink2);
      y += 30;
    }

    y += 62;
    centerText(ctx, d.traitName || "", y, "bold 80px", C.ink);

    y += 74;
    ctx.font = font("34px");
    const descLines = wrap(ctx, d.traitDesc || "", 800, 4);
    ctx.fillStyle = C.ink2;
    ctx.textAlign = "center";
    for (const line of descLines) {
      ctx.fillText(line, W / 2, y);
      y += 46;
    }

    if (d.secondLine) {
      y += 24;
      centerText(ctx, d.secondLine, y, "30px", C.ink3);
      y += 10;
    }

    // 일치율 블록 (아래쪽 고정 영역, 본문이 길면 밀려남)
    const blockTop = Math.max(y + 84, 1010);

    ctx.font = font("30px");
    ctx.fillStyle = C.ink2;
    ctx.textAlign = "left";
    ctx.fillText(d.matchLine || "", BAR_X, blockTop);

    const pct = Math.max(0, Math.min(100, Number(d.matchPct) || 0));
    const barY = blockTop + 30;

    ctx.fillStyle = C.vizTrack;
    roundRect(ctx, BAR_X, barY, BAR_W, BAR_H, BAR_R);
    ctx.fill();

    if (pct > 0) {
      const fillW = Math.max(BAR_H, (BAR_W * pct) / 100);
      ctx.save();
      roundRect(ctx, BAR_X, barY, BAR_W, BAR_H, BAR_R);
      ctx.clip();
      ctx.fillStyle = C.vizSeries;
      roundRect(ctx, BAR_X, barY, fillW, BAR_H, BAR_R);
      ctx.fill();
      ctx.restore();
    }

    ctx.font = font("bold 34px");
    ctx.fillStyle = C.ink;
    ctx.textAlign = "left";
    ctx.fillText(pct + "%", BAR_X + BAR_W + 22, barY + BAR_H);

    // 풋터
    centerText(ctx, d.appTitle || "", cy + chh - 96, "bold 32px", C.accent);
    centerText(ctx, "나의 육아 성향 테스트", cy + chh - 52, "26px", C.ink3);

    return canvas;
  }

  /* ---------------- 저장 / 공유 ---------------- */

  function toBlob(canvas) {
    return new Promise((resolve) => {
      try {
        canvas.toBlob((blob) => resolve(blob), "image/png");
      } catch (e) {
        resolve(null);
      }
    });
  }

  function download(canvas, filename) {
    return toBlob(canvas).then((blob) => {
      if (!blob) return false;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "육아성향.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    });
  }

  function canWebShare() {
    try {
      if (!navigator.share || !navigator.canShare || typeof File === "undefined") return false;
      const dummy = new File([new Blob([new Uint8Array(1)], { type: "image/png" })],
        "test.png", { type: "image/png" });
      return !!navigator.canShare({ files: [dummy] });
    } catch (e) {
      return false;
    }
  }

  function share(canvas) {
    return toBlob(canvas).then((blob) => {
      if (!blob) return false;
      let file;
      try {
        file = new File([blob], "육아성향.png", { type: "image/png" });
      } catch (e) {
        return download(canvas, "육아성향.png");
      }
      if (!navigator.share) return download(canvas, "육아성향.png");

      return navigator.share({ files: [file], title: "나의 육아 성향" })
        .then(() => true)
        .catch((err) => {
          // 사용자가 취소한 경우(AbortError)는 조용히 무시, 그 외 실패는 저장으로 폴백
          if (err && err.name === "AbortError") return false;
          return download(canvas, "육아성향.png");
        });
    });
  }

  return { render, download, canWebShare, share };
})();
