/*!
 * Criteo Inspector v2 — mostra os disparos da Criteo (OneTag) no Console do navegador.
 *
 * Como usar: abra a página do site, F12 > Console, cole este código e dê Enter.
 * Dica: salve em DevTools > Sources > Snippets para rodar com Ctrl+Enter em qualquer página.
 *
 * Comandos depois de rodar:
 *   criteoInspector.summary()      tabela com todos os disparos capturados
 *   criteoInspector.decode(url)    decodifica uma URL de evento copiada da aba Network
 *   criteoInspector.hits           dados de cada disparo (ex.: copy(criteoInspector.hits[0]))
 *   criteoInspector.stop()         para de monitorar
 */
(function criteoInspector() {
  "use strict";

  const CONFIG = {
    collapsed: true,        // disparos aparecem fechados; clique na linha para abrir
    expandOnWarning: true,  // ...mas os que têm alerta já abrem sozinhos
    clearConsole: true,     // limpa o console ao iniciar
    currency: null,         // ex.: "BRL" para mostrar os valores como R$
    locale: "pt-BR",
  };

  // Colou o script de novo? Encerra a instância anterior para não duplicar o monitoramento.
  if (window.criteoInspector && typeof window.criteoInspector.stop === "function") {
    try { window.criteoInspector.stop(true); } catch (e) { /* ignora */ }
  }

  /* ═══════════════════════════ Mapeamentos ═══════════════════════════ */

  // Códigos de evento que aparecem em p0, p1, p2… (e=…)
  const EVENTS = {
    vh:  { icon: "🏠", name: "viewHome",         label: "Home",            color: "#2563eb", page: true },
    vl:  { icon: "📋", name: "viewList",         label: "Listagem",        color: "#7c3aed", page: true },
    vs:  { icon: "🔎", name: "viewSearch",       label: "Busca",           color: "#4f46e5", page: true },
    vp:  { icon: "🛍️", name: "viewItem",         label: "Produto",         color: "#0e7490", page: true },
    ac:  { icon: "➕", name: "addToCart",        label: "Add ao carrinho", color: "#15803d", page: true },
    vb:  { icon: "🛒", name: "viewBasket",       label: "Carrinho",        color: "#b45309", page: true },
    vc:  { icon: "💰", name: "trackTransaction", label: "Compra",          color: "#be185d", page: true },
    vpg: { icon: "📄", name: "viewPage",         label: "Página",          color: "#475569", page: true },
    exd: { icon: "⚙️", name: "extraData",        label: "Contexto / device" },
    ce:  { icon: "✉️", name: "setEmail",         label: "E-mail" },
    id:  { icon: "🆔", name: "id",               label: "Identificador" },
    dis: { icon: "🔀", name: "callDising",       label: "DIS (Dynamic Inventory Selection)" },
    setData: { icon: "📦", name: "setData",      label: "Dados customizados" },
  };
  const UNKNOWN_EVENT = { icon: "❔", label: "Evento não mapeado" };
  const MAIN_PRIORITY = ["vc", "ac", "vb", "vp", "vl", "vs", "vh", "vpg"];
  const PRODUCT_EVENTS = ["ac", "vb", "vc"];
  const SITE_TYPES = { d: "🖥️ Desktop", m: "📱 Mobile", t: "📟 Tablet" };
  const SITE_TYPES_SHORT = { d: "🖥️ desktop", m: "📱 mobile", t: "📟 tablet" };
  const FIELD_LABELS = { p: "Produtos (p)", id: "Transaction ID (id)", m: "E-mail (m)", site_type: "Device (site_type)", a: "Contas (a)" };
  const ORIGIN_LABELS = { history: "Histórico da página", live: "Capturado ao vivo", manual: "decode() manual" };
  const EVENT_URL = /criteo\.com\/event/;
  const LOADER_URL = /criteo\.(?:com|net)\/js\/ld\/ld\.js/;

  /* ═══════════════════════════ Estilos ═══════════════════════════ */

  const COLOR = {
    brand: "#fe5000", slate: "#334155", muted: "#8b95a7", meta: "#64748b",
    ok: "#16a34a", warn: "#d97706", error: "#ef4444", info: "#0ea5e9",
  };
  const pill = (bg, fg = "#fff", radius = "10px") =>
    `background:${bg};color:${fg};font-weight:700;padding:2px 8px;border-radius:${radius};`;

  const S = {
    brand: pill(COLOR.brand, "#fff", "4px 0 0 4px"),
    counter: pill(COLOR.slate, "#e2e8f0", "0 4px 4px 0"),
    live: pill(COLOR.info),
    manual: pill("#6d28d9"),
    headline: "font-weight:700;",
    muted: `color:${COLOR.muted};`,
    warnPill: pill("#f59e0b", "#1f2937"),
    errorPill: pill(COLOR.error),
    okMark: `color:${COLOR.ok};font-weight:800;`,
    section: `background:rgba(254,80,0,.12);color:${COLOR.brand};font-weight:700;padding:1px 8px;border-radius:4px;`,
    note: `color:${COLOR.muted};`,
    code: "font-family:ui-monospace,Menlo,Consolas,monospace;background:rgba(127,127,127,.18);padding:1px 6px;border-radius:3px;",
    bannerA: pill(COLOR.brand, "#fff", "6px 0 0 6px") + "font-size:13px;padding:4px 10px;",
    bannerB: pill("#0f172a", "#f8fafc", "0 6px 6px 0") + "font-size:13px;padding:4px 10px;",
    issue: {
      error: `color:${COLOR.error};font-weight:700;`,
      warn: `color:${COLOR.warn};font-weight:600;`,
      info: `color:${COLOR.info};`,
      ok: `color:${COLOR.ok};font-weight:600;`,
    },
  };
  const ISSUE_ICON = { error: "✖", warn: "⚠", info: "ℹ", ok: "✓" };

  // Monta uma linha com vários trechos estilizados (%c)
  function styledLine() {
    const parts = [], styles = [];
    const api = {
      add(text, style = "") { parts.push("%c" + text); styles.push(style); return api; },
      gap() { return api.add("  "); },
      args() { return [parts.join(""), ...styles]; },
    };
    return api;
  }

  /* ═══════════════════════════ Decodificação ═══════════════════════════ */

  const HAS_PCT = /%[0-9a-f]{2}/i;

  function decodeOnce(s) {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }

  // A Criteo codifica os valores mais de uma vez: decodifica até 3 camadas
  function deepDecode(s, max = 3) {
    let out = String(s ?? "");
    for (let i = 0; i < max && HAS_PCT.test(out); i++) {
      const next = decodeOnce(out);
      if (next === out) break;
      out = next;
    }
    return out;
  }

  // Divide pelo separador só no nível 0 (ignora o que está dentro de [ ] e { })
  function splitTop(str, sep) {
    const parts = [];
    let depth = 0, cur = "";
    for (const ch of str) {
      if (ch === "[" || ch === "{") depth++;
      else if ((ch === "]" || ch === "}") && depth > 0) depth--;
      if (ch === sep && depth === 0) { parts.push(cur); cur = ""; }
      else cur += ch;
    }
    parts.push(cur);
    return parts.filter((p) => p.trim() !== "");
  }

  function parsePairs(str) {
    return splitTop(str, "&").map((piece) => {
      const i = piece.indexOf("=");
      return i < 0 ? [deepDecode(piece), ""] : [deepDecode(piece.slice(0, i)), piece.slice(i + 1)];
    });
  }

  // Um valor pode ser lista [..], JSON {..} ou texto: decodifica camada por camada
  // para não quebrar IDs ou preços que tenham vírgula ou "&" codificados.
  function parseValue(v) {
    let s = String(v ?? "").trim();
    for (let i = 0; i < 4; i++) {
      if (s.startsWith("[") && s.endsWith("]")) return parseList(s.slice(1, -1));
      if (s.startsWith("{") && s.endsWith("}")) {
        try { return JSON.parse(s); } catch (e) { break; }
      }
      if (!/^%(5B|7B)/i.test(s)) break;
      const next = decodeOnce(s).trim();
      if (next === s) break;
      s = next;
    }
    return deepDecode(s);
  }

  // Itens de produto: [i=..&pr=..&q=..,i=..&pr=..&q=..] — também aceita itens separados por "&"
  function parseList(inner) {
    const out = [];
    for (const chunk of splitTop(inner, ",")) {
      const c = chunk.trim();
      if (!c.includes("=") && /%(3D|2C)/i.test(c)) {
        const next = decodeOnce(c);
        if (next !== c) { out.push(...parseList(next)); continue; }
      }
      if (!c.includes("=")) { out.push(deepDecode(c)); continue; }
      let item = null;
      for (const [k, val] of parsePairs(c)) {
        if (!item || Object.prototype.hasOwnProperty.call(item, k)) { item = {}; out.push(item); }
        item[k] = parseValue(val);
      }
    }
    return out;
  }

  function parseEvent(param, raw) {
    let s = String(raw ?? "");
    for (let i = 0; i < 3 && !s.includes("=") && HAS_PCT.test(s); i++) s = decodeOnce(s);
    const fields = {};
    for (const [k, v] of parsePairs(s)) fields[k] = parseValue(v);
    const code = typeof fields.e === "string" && fields.e ? fields.e : "?";
    delete fields.e;
    const def = EVENTS[code] || { ...UNKNOWN_EVENT, name: code };
    return { param, code, def, fields, raw: s };
  }

  /* ═══════════════════════════ Modelo de dados ═══════════════════════════ */

  const state = { hits: [], seen: new Set(), transactions: new Map(), counter: 0, observer: null };

  const asList = (v) => (Array.isArray(v) ? v : v === undefined || v === null || v === "" ? [] : [v]);
  const stringify = (v) => (v !== null && typeof v === "object" ? JSON.stringify(v) : String(v ?? ""));
  const toNum = (v) =>
    v === undefined || v === null || v === "" || typeof v === "object" ? NaN : Number(String(v).trim());
  const idOf = (x) => (x && typeof x === "object" && !Array.isArray(x) ? stringify(x.i ?? x.id ?? x) : stringify(x));
  const productIdOf = (p) => asList(p).map(idOf)[0] || "";

  function toProducts(p) {
    return asList(p).map((raw, idx) => {
      const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : { i: raw };
      const { i, id, pr, q, ...extra } = obj;
      const item = {
        n: idx + 1,
        id: stringify(i ?? id ?? ""),
        rawPrice: pr,
        rawQty: q,
        price: toNum(pr),
        qty: toNum(q),
        extra,
        problems: [],
      };
      if (!item.id) item.problems.push("sem ID");
      if (!Number.isFinite(item.price) || item.price < 0) item.problems.push("preço");
      if (!Number.isInteger(item.qty) || item.qty <= 0) item.problems.push("qtd");
      return item;
    });
  }

  function currencyOf(fields) {
    for (const k of ["currency", "cur", "c"]) {
      const v = fields && fields[k];
      if (typeof v === "string" && /^[A-Z]{3}$/.test(v)) return v;
    }
    return CONFIG.currency;
  }

  function totals(items, fields) {
    let units = 0, total = 0;
    for (const it of items) {
      if (Number.isFinite(it.qty)) units += it.qty;
      if (Number.isFinite(it.price) && Number.isFinite(it.qty)) total += it.price * it.qty;
    }
    return { lines: items.length, units, total: Math.round(total * 100) / 100, currency: currencyOf(fields) };
  }

  function toURL(input) {
    const s = String(input ?? "").trim();
    if (/^\??(a|v|p\d+)=/.test(s)) return new URL("https://sslwidget.criteo.com/event?" + s.replace(/^\?/, ""));
    if (s.startsWith("//")) return new URL("https:" + s);
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) return new URL("https://" + s);
    return new URL(s);
  }

  function accountsOf(url) {
    try { return new URL(url).searchParams.getAll("a").join(", ") || "—"; } catch (e) { return "—"; }
  }

  function buildHit(urlStr, entry, origin) {
    const url = toURL(urlStr);
    const sp = url.searchParams;

    const events = [];
    sp.forEach((value, key) => { if (/^p\d+$/.test(key)) events.push(parseEvent(key, value)); });
    events.sort((a, b) => Number(a.param.slice(1)) - Number(b.param.slice(1)));
    for (const ev of events) {
      if (PRODUCT_EVENTS.includes(ev.code)) {
        ev.products = toProducts(ev.fields.p);
        ev.totals = totals(ev.products, ev.fields);
      }
      if (ev.code === "vl") ev.ids = asList(ev.fields.p).map(idOf).filter(Boolean);
    }

    const pageEvents = events.filter((e) => e.def.page);
    const rank = (c) => (MAIN_PRIORITY.includes(c) ? MAIN_PRIORITY.indexOf(c) : 99);
    const main = pageEvents.slice().sort((a, b) => rank(a.code) - rank(b.code))[0] || null;

    const emailEvents = events.filter((e) => e.code === "ce");
    const emails = emailEvents.flatMap((e) => asList(e.fields.m)).map(stringify).filter(Boolean);
    const siteType = events.map((e) => e.fields.site_type).find((v) => typeof v === "string" && v) || null;

    let cookies = null;
    if (sp.has("sc")) {
      const raw = deepDecode(sp.get("sc"));
      try { cookies = JSON.parse(raw); } catch (e) { cookies = null; }
      if (!cookies || typeof cookies !== "object") cookies = { sc: raw };
    }

    const KNOWN = new Set(["a", "v", "tld", "fu", "ceid", "sc"]);
    const others = {};
    sp.forEach((value, key) => {
      if (KNOWN.has(key) || /^p\d+$/.test(key)) return;
      others[key] = key in others ? `${others[key]}, ${deepDecode(value)}` : deepDecode(value);
    });

    return {
      n: ++state.counter,
      origin,
      time: entry ? new Date(performance.timeOrigin + entry.startTime) : new Date(),
      durationMs: entry ? Math.round(entry.duration) : null,
      via: entry ? entry.initiatorType || "—" : "—",
      endpoint: url.host + url.pathname,
      account: sp.getAll("a").join(", ") || null,
      version: sp.get("v"),
      tld: sp.get("tld"),
      pageUrl: deepDecode(sp.get("fu") || ""),
      ceid: sp.get("ceid"),
      events,
      pageEvents,
      main,
      emails,
      hasEmailEvent: emailEvents.length > 0,
      siteType,
      cookies,
      others,
      url: url.href,
      issues: [],
    };
  }

  /* ═══════════════════════════ Diagnóstico ═══════════════════════════ */

  const fmtRaw = (v) => (v === undefined ? "(ausente)" : `"${stringify(v)}"`);

  function diagnose(hit) {
    const add = (level, msg) => hit.issues.push({ level, msg });

    if (!hit.account) add("error", "Requisição sem Account ID (parâmetro a).");
    if (!hit.events.length) {
      add("error", "Nenhum evento (p0, p1…) encontrado na requisição.");
      return;
    }
    if (!hit.main) add("info", "Sem evento de página neste disparo: só contexto/identificação.");

    for (const ev of hit.events) {
      const f = ev.fields;
      if (!EVENTS[ev.code]) add("info", `Código de evento não mapeado: "${ev.code}" (${ev.param}).`);
      if (ev.code === "vp" && !productIdOf(f.p)) add("warn", "viewItem sem ID de produto (p).");
      if (ev.code === "vl" && !ev.ids.length) add("warn", "viewList sem IDs de produto (p).");

      if (ev.products) {
        if (!ev.products.length) add("warn", `${ev.def.name} sem produtos (p).`);
        for (const it of ev.products) {
          const who = `${ev.def.name} · item ${it.n}${it.id ? ` (${it.id})` : ""}`;
          if (!it.id) add("warn", `${who}: sem ID de produto.`);
          if (!Number.isFinite(it.price)) {
            const comma = typeof it.rawPrice === "string" && it.rawPrice.includes(",");
            add("warn", `${who}: preço inválido ${fmtRaw(it.rawPrice)}${comma ? " (use ponto como separador decimal)" : ""}.`);
          } else if (it.price < 0) {
            add("warn", `${who}: preço negativo (${it.rawPrice}).`);
          } else if (it.price === 0) {
            add("info", `${who}: preço zero (brinde?).`);
          }
          if (!Number.isInteger(it.qty) || it.qty <= 0) add("warn", `${who}: quantidade inválida ${fmtRaw(it.rawQty)}.`);
        }
      }

      if (ev.code === "vc") {
        const tid = typeof f.id === "string" ? f.id.trim() : "";
        if (!tid) {
          add("error", "Compra (trackTransaction) sem Transaction ID (id).");
        } else if (hit.origin !== "manual") {
          const first = state.transactions.get(tid);
          if (first && first !== hit.n) add("warn", `Transaction ID "${tid}" repetido: já apareceu no disparo #${first} (possível conversão duplicada).`);
          else state.transactions.set(tid, hit.n);
        }
      }
    }

    if (hit.hasEmailEvent && !hit.emails.length) add("info", "E-mail vazio (m=[]): normal para visitante não identificado.");
  }

  /* ═══════════════════════════ Formatação ═══════════════════════════ */

  const numberFmt = new Intl.NumberFormat(CONFIG.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function money(n, currency) {
    if (!Number.isFinite(n)) return "—";
    if (currency) {
      try { return new Intl.NumberFormat(CONFIG.locale, { style: "currency", currency }).format(n); } catch (e) { /* moeda inválida */ }
    }
    return numberFmt.format(n);
  }

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const short = (s, max = 80) => { const t = String(s ?? ""); return t.length > max ? t.slice(0, max - 1) + "…" : t; };
  const fmtTime = (d) => d.toLocaleTimeString(CONFIG.locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const pathOf = (u) => { try { const x = new URL(u); return x.pathname + x.search; } catch (e) { return u || ""; } };
  const deviceOf = (h) => (h.siteType ? `${SITE_TYPES[h.siteType] || "❔"} (${h.siteType})` : "—");
  const emailOf = (h) => (h.emails.length ? `✓ ${plural(h.emails.length, "hash", "hashes")}` : h.hasEmailEvent ? "vazio" : "não enviado");
  const alertsOf = (h) => h.issues.filter((i) => i.level === "error" || i.level === "warn");

  function restFields(fields, skip) {
    const out = {};
    for (const [k, v] of Object.entries(fields)) if (!skip.includes(k)) out[FIELD_LABELS[k] || k] = stringify(v);
    return out;
  }

  function inlineFields(fields, skip = []) {
    return Object.entries(fields)
      .filter(([k]) => !skip.includes(k))
      .map(([k, v]) => `${k}: ${short(stringify(v), 40)}`)
      .join(" | ");
  }

  function basketText(t) {
    const units = t.units !== t.lines ? ` (${t.units} un.)` : "";
    return `${plural(t.lines, "item", "itens")}${units} · ${money(t.total, t.currency)}`;
  }

  // Texto curto do evento principal, usado no cabeçalho e no resumo
  function headline(hit) {
    const ev = hit.main;
    if (!ev) return "";
    if (ev.code === "vc") return `pedido ${short(ev.fields.id || "⚠ sem ID", 28)} · ${basketText(ev.totals)}`;
    if (ev.totals) return basketText(ev.totals);
    if (ev.code === "vl") return plural(ev.ids.length, "produto", "produtos");
    if (ev.code === "vp") return `ID ${short(productIdOf(ev.fields.p) || "⚠ vazio", 32)}`;
    return "";
  }

  function metaLine(hit) {
    const bits = [hit.account ? `conta ${hit.account}` : "⚠ sem conta"];
    if (hit.siteType) bits.push(SITE_TYPES_SHORT[hit.siteType] || `site_type ${hit.siteType}`);
    bits.push(hit.emails.length ? "✉️ e-mail ✓" : hit.hasEmailEvent ? "✉️ e-mail vazio" : "✉️ sem e-mail");
    const path = pathOf(hit.pageUrl);
    if (path) bits.push(short(path, 32));
    return bits.join("  ·  ");
  }

  function eventSummary(ev) {
    const f = ev.fields;
    switch (ev.code) {
      case "vl":
        return ev.ids.length ? `${plural(ev.ids.length, "ID", "IDs")}: ${short(ev.ids.join(", "), 60)}` : "⚠ sem IDs";
      case "vp":
        return `ID ${productIdOf(f.p) || "⚠ vazio"}` + (inlineFields(f, ["p"]) ? ` | ${inlineFields(f, ["p"])}` : "");
      case "ac":
      case "vb":
        return basketText(ev.totals);
      case "vc":
        return `pedido ${f.id || "⚠ sem ID"} · ${basketText(ev.totals)}`;
      case "exd": {
        const rest = inlineFields(f, ["site_type"]);
        const st = f.site_type ? `site_type ${f.site_type} → ${SITE_TYPES[f.site_type] || "❔"}` : "";
        return [st, rest].filter(Boolean).join(" | ") || "—";
      }
      case "ce": {
        const n = asList(f.m).length;
        return n ? `${plural(n, "hash", "hashes")} de e-mail` : "vazio (m=[])";
      }
      default:
        return inlineFields(f) || "—";
    }
  }

  /* ═══════════════════════════ Saída no console ═══════════════════════════ */

  function section(title, note) {
    if (note) console.log(`%c${title}%c  ${note}`, S.section, S.note);
    else console.log(`%c${title}`, S.section);
  }

  // Tabela de duas colunas (campo → valor)
  function kv(obj, max = 120) {
    const rows = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || v === null || v === "") continue;
      rows[k] = { Valor: short(stringify(v), max) };
    }
    if (Object.keys(rows).length) console.table(rows);
  }

  function renderDiagnosis(hit) {
    section("🩺 Diagnóstico");
    const order = { error: 0, warn: 1, info: 2 };
    if (!alertsOf(hit).length) console.log(`%c${ISSUE_ICON.ok} Nenhum problema encontrado`, S.issue.ok);
    hit.issues
      .slice()
      .sort((a, b) => order[a.level] - order[b.level])
      .forEach((i) => console.log(`%c${ISSUE_ICON[i.level]} ${i.msg}`, S.issue[i.level]));
  }

  function renderEvents(hit) {
    section("🎯 Eventos enviados", plural(hit.events.length, "evento", "eventos"));
    const rows = {};
    for (const ev of hit.events) {
      rows[ev.param] = {
        Código: ev.code,
        Evento: `${ev.def.icon} ${ev.def.name}`,
        Descrição: ev.def.label,
        Resumo: eventSummary(ev),
      };
    }
    if (Object.keys(rows).length) console.table(rows);
  }

  function productTable(items, t) {
    if (!items.length) return;
    const rows = {};
    for (const it of items) {
      const sub = Number.isFinite(it.price) && Number.isFinite(it.qty) ? it.price * it.qty : NaN;
      const extras = {};
      for (const [k, v] of Object.entries(it.extra)) extras[k] = stringify(v);
      rows[`#${it.n}`] = {
        "ID do produto": it.id || "⚠ vazio",
        "Preço unit.": Number.isFinite(it.price) ? money(it.price, t.currency) : `⚠ ${fmtRaw(it.rawPrice)}`,
        Qtd: Number.isFinite(it.qty) ? it.qty : `⚠ ${fmtRaw(it.rawQty)}`,
        Subtotal: money(sub, t.currency),
        ...extras,
        Check: it.problems.length ? `⚠ ${it.problems.join(", ")}` : "✓",
      };
    }
    rows.TOTAL = { "ID do produto": "", "Preço unit.": "", Qtd: t.units, Subtotal: money(t.total, t.currency), Check: "" };
    console.table(rows);
  }

  function renderEventDetail(ev) {
    const f = ev.fields, d = ev.def;
    if (ev.products) {
      const t = ev.totals;
      const order = ev.code === "vc" ? `pedido ${f.id || "⚠ sem ID"} · ` : "";
      section(`${d.icon} ${d.label} · ${d.name}`,
        `${order}${plural(t.lines, "item", "itens")} · ${plural(t.units, "unidade", "unidades")} · total ${money(t.total, t.currency)}`);
      kv(restFields(f, ev.code === "vc" ? ["p", "id"] : ["p"]));
      productTable(ev.products, t);
    } else if (ev.code === "vl") {
      section(`${d.icon} ${d.label} · ${d.name}`, plural(ev.ids.length, "produto", "produtos"));
      if (ev.ids.length) console.table(Object.fromEntries(ev.ids.map((id, i) => [`#${i + 1}`, { "ID do produto": id }])));
      kv(restFields(f, ["p"]));
    } else if (ev.code === "vp") {
      section(`${d.icon} ${d.label} · ${d.name}`);
      kv({ "ID do produto (p)": productIdOf(f.p) || "⚠ não enviado", ...restFields(f, ["p"]) });
    } else if (d.page && Object.keys(f).length) {
      section(`${d.icon} ${d.label} · ${d.name}`);
      kv(restFields(f, []));
    }
  }

  function renderIdentity(hit) {
    const rows = { "Device (site_type)": deviceOf(hit) };
    if (hit.emails.length) {
      hit.emails.forEach((h, i) => { rows[hit.emails.length > 1 ? `E-mail #${i + 1} (m)` : "E-mail (m)"] = h; });
    } else {
      rows["E-mail (m)"] = hit.hasEmailEvent ? "vazio (m=[])" : "não enviado (sem evento ce)";
    }
    for (const ev of hit.events) {
      if (ev.def.page) continue;
      for (const [k, v] of Object.entries(ev.fields)) {
        if ((ev.code === "exd" && k === "site_type") || (ev.code === "ce" && k === "m")) continue;
        rows[`${ev.code} · ${k}`] = stringify(v);
      }
    }
    section("👤 Identificação e contexto");
    kv(rows);
  }

  function renderRequest(hit) {
    section("📡 Requisição");
    kv({
      "Conta (a)": hit.account || "⚠ ausente",
      "Versão do OneTag (v)": hit.version,
      "Domínio (tld)": hit.tld,
      "Página (fu)": hit.pageUrl,
      "Event ID (ceid)": hit.ceid,
      Endpoint: hit.endpoint,
      Horário: hit.time.toLocaleString(CONFIG.locale),
      Duração: hit.durationMs !== null ? `${hit.durationMs} ms` : "",
      "Disparado via": hit.via,
      Origem: ORIGIN_LABELS[hit.origin],
    }, 140);
  }

  function render(hit, forceOpen) {
    const alerts = alertsOf(hit);
    const hasError = alerts.some((i) => i.level === "error");
    const main = hit.main;
    const def = main ? main.def : { icon: "⚙️", label: "Config / identificação", color: COLOR.meta };
    const more = hit.pageEvents.length > 1 ? ` +${hit.pageEvents.length - 1}` : "";

    const head = styledLine()
      .add(" CRITEO ", S.brand)
      .add(` #${hit.n} · ${fmtTime(hit.time)} `, S.counter);
    if (hit.origin === "live") head.gap().add(" NOVO ", S.live);
    if (hit.origin === "manual") head.gap().add(" MANUAL ", S.manual);
    head.gap().add(` ${def.icon} ${def.label}${more} `, pill(def.color || COLOR.meta)).gap();
    if (alerts.length) {
      head.add(` ${hasError ? "✖" : "⚠"} ${plural(alerts.length, "alerta", "alertas")} `, hasError ? S.errorPill : S.warnPill);
    } else {
      head.add("✓", S.okMark);
    }
    const hl = headline(hit);
    if (hl) head.gap().add(hl, S.headline);
    head.gap().add(metaLine(hit), S.muted);

    const open = forceOpen || !CONFIG.collapsed || (CONFIG.expandOnWarning && alerts.length > 0);
    console[open ? "group" : "groupCollapsed"](...head.args());

    renderDiagnosis(hit);
    renderEvents(hit);
    hit.events.forEach(renderEventDetail);
    renderIdentity(hit);
    renderRequest(hit);
    if (hit.cookies) {
      section("🍪 Cookies de terceiros (sc)");
      kv(hit.cookies);
    }
    if (Object.keys(hit.others).length) {
      section("🧩 Outros parâmetros", plural(Object.keys(hit.others).length, "parâmetro", "parâmetros"));
      kv(hit.others);
    }

    console.groupCollapsed("%c🔗 URL e payload bruto", S.note);
    console.log(hit.url);
    hit.events.forEach((ev) => console.log(`%c${ev.param}%c ${ev.raw}`, S.code, ""));
    console.groupEnd();

    console.log(`%c↳ objeto completo em criteoInspector.hits[${state.hits.indexOf(hit)}]`, S.note, hit);
    console.groupEnd();
  }

  function banner(pastCount, loaderEntry) {
    console.log("%c CRITEO %c INSPECTOR v2 ", S.bannerA, S.bannerB);
    if (loaderEntry) {
      console.log(`%c✓ Loader (ld.js) carregado%c  conta ${accountsOf(loaderEntry.name)} · ${Math.round(loaderEntry.duration)} ms`, S.issue.ok, S.note);
    } else if (pastCount) {
      console.log("%cℹ ld.js não aparece no histórico da página, mas há disparos: a Criteo está ativa.", S.issue.info);
    } else if (typeof window.criteo_q !== "undefined") {
      console.log("%c✖ window.criteo_q existe, mas o loader (ld.js) não carregou%c  provavelmente falta a tag Criteo Loader", S.issue.error, S.note);
    } else {
      console.log("%c⚠ Nenhum sinal da Criteo nesta página até agora (sem ld.js e sem window.criteo_q).", S.issue.warn);
    }
    console.log(`%c${plural(pastCount, "disparo", "disparos")} no histórico · monitorando novos em tempo real…`, S.note);
    console.log(
      "%ccriteoInspector.summary()%c resumo   %ccriteoInspector.decode(url)%c decodificar URL   %ccriteoInspector.stop()%c parar",
      S.code, S.note, S.code, S.note, S.code, S.note
    );
  }

  /* ═══════════════════════════ Comandos públicos ═══════════════════════════ */

  function summary() {
    if (!state.hits.length) {
      console.log("%cNenhum disparo da Criteo capturado ainda.", S.note);
      return;
    }
    const rows = {};
    for (const h of state.hits) {
      const alerts = alertsOf(h).length;
      rows[`#${h.n}`] = {
        Hora: fmtTime(h.time),
        Evento: h.main ? `${h.main.def.icon} ${h.main.def.label}` : "⚙️ Config",
        Detalhe: headline(h),
        Conta: h.account || "⚠",
        Device: deviceOf(h),
        "E-mail": emailOf(h),
        Página: short(pathOf(h.pageUrl), 40),
        Status: alerts ? `⚠ ${alerts}` : "✓",
      };
    }
    section("📊 Resumo dos disparos", plural(state.hits.length, "disparo", "disparos"));
    console.table(rows);
  }

  function decode(url) {
    let hit;
    try {
      hit = buildHit(url, null, "manual");
    } catch (e) {
      console.log("%c✖ Não consegui ler essa URL. Cole a URL completa do evento (…criteo.com/event?a=…).", S.issue.error);
      return undefined;
    }
    diagnose(hit);
    state.hits.push(hit);
    render(hit, true);
    return hit;
  }

  function stop(silent) {
    if (state.observer) { state.observer.disconnect(); state.observer = null; }
    if (!silent) console.log("%c■ Criteo Inspector parado.", S.note);
  }

  window.criteoInspector = { version: "2.0", config: CONFIG, hits: state.hits, summary, decode, stop };

  /* ═══════════════════════════ Captura ═══════════════════════════ */

  function handleEntry(entry, origin) {
    const isEvent = EVENT_URL.test(entry.name);
    const isLoader = LOADER_URL.test(entry.name);
    if (!isEvent && !isLoader) return;

    const key = entry.name + "|" + entry.startTime;
    if (state.seen.has(key)) return;
    state.seen.add(key);

    if (isLoader) {
      if (origin === "live") console.log(`%c✓ Loader (ld.js) carregado agora%c  conta ${accountsOf(entry.name)}`, S.issue.ok, S.note);
      return;
    }
    try {
      const hit = buildHit(entry.name, entry, origin);
      diagnose(hit);
      state.hits.push(hit);
      render(hit);
    } catch (err) {
      console.warn("Criteo Inspector: não consegui ler este disparo.", entry.name, err);
    }
  }

  if (CONFIG.clearConsole) console.clear();

  const past = performance.getEntriesByType("resource");
  const pastEvents = past.filter((e) => EVENT_URL.test(e.name)).sort((a, b) => a.startTime - b.startTime);
  const loaderEntry = past.find((e) => LOADER_URL.test(e.name));
  if (loaderEntry) state.seen.add(loaderEntry.name + "|" + loaderEntry.startTime);

  banner(pastEvents.length, loaderEntry);
  pastEvents.forEach((e) => handleEntry(e, "history"));
  if (state.hits.length > 1) console.log("%cDica: criteoInspector.summary() mostra todos os disparos numa tabela.", S.note);

  // Continua monitorando novos disparos (SPA, cliques, add to cart…)
  state.observer = new PerformanceObserver((list) => list.getEntries().forEach((e) => handleEntry(e, "live")));
  state.observer.observe({ entryTypes: ["resource"] });
})();
