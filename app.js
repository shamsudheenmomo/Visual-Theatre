/* ===== CONFIGURATION =====
   APPS_SCRIPT_URL : paste your deployed Apps Script Web App URL (ends with /exec).
					 Leave empty to run in DEMO mode (no backend, random booking ID).
   WHATSAPP_NUMBER : optional, digits only with country code (e.g. 919876543210).
					 Leave empty to let the visitor pick the WhatsApp contact. */
const CONFIG = {
	APPS_SCRIPT_URL:
		"https://script.google.com/macros/s/AKfycbwPOCveiO0T2XzbVTcDx6D54re_K3HD87WI8mhNF9EVR6Ga1CwiR9cpYK9O57uzx6zcNQ/exec",
	WHATSAPP_NUMBER: "971502395626",
};
const LIVE = !!CONFIG.APPS_SCRIPT_URL.trim();
const shows = [
	["ആത്മീയതയും ജീവിതക്രമവും", 66],
	["ചരിത്രവും വ്യക്തിത്വ വികസനവും", 63.5],
	["ചരിത്രസ്മരണകളും ഭാവിലോകവും", 72],
	["അറിവും സദാചാരവും", 67],
	["ശാസ്ത്രവും സാമൂഹിക ചിന്തയും", 56.5],
	["സമകാലിക ലോകവും സമൂഹവും", 46],
];

const fmt = (n) => {
	let m = Math.floor(n),
		s = Math.round((n - m) * 60);
	return s ? `${m} മിനിറ്റ് ${s} സെക്കൻഡ്` : `${m} മിനിറ്റ്`;
};

const thumbs = [
	"img/section-1.jpg",
	"img/section-2.jpg",
	"img/section-3.jpg",
	"img/section-4.jpg",
	"img/section-5.jpg",
	"img/section-6.jpg",
];
/* ===== Live backend helpers (Google Apps Script) ===== */
let liveShows = [],
	loaded = false,
	failed = false,
	selectedIdx = 0;
const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

function shortId() {
	const c = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
	let s = "";
	for (let i = 0; i < 5; i++) s += c[Math.floor(Math.random() * c.length)];
	return s;
}

function waBase() {
	return (
		"https://wa.me/" +
		String(CONFIG.WHATSAPP_NUMBER || "").replace(/\D/g, "")
	);
}

function todayStr() {
	const d = new Date(istNow());
	return (
		d.getUTCFullYear() +
		"-" +
		String(d.getUTCMonth() + 1).padStart(2, "0") +
		"-" +
		String(d.getUTCDate()).padStart(2, "0")
	);
}

function fmtDate(v) {
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ""));
	return m ? +m[3] + " " + MONTHS[+m[2] - 1] + " " + m[1] : String(v || "");
}

function slotLabel(x) {
	return [
		x.SlotType,
		fmtDate(x.ShowDate),
		[x.StartTime, x.EndTime].filter(Boolean).join("–"),
	]
		.filter(Boolean)
		.join(" · ");
}

/* A sheet row belongs to section N when its DocumentaryID is N (1-6) or its Title equals the section title. */
function showsFor(i) {
	const t = shows[i][0].trim(),
		td = todayStr();
	return liveShows
		.filter(
			(x) =>
				String(x.Status).toUpperCase() === "ACTIVE" &&
				(String(x.DocumentaryID).trim() === String(i + 1) ||
					String(x.Title).trim() === t) &&
				!(/^\d{4}-\d{2}-\d{2}$/.test(x.ShowDate) && x.ShowDate < td) &&
				[0, 6].includes(dow(x.ShowDate)),
		)
		.sort((a, b) =>
			(String(a.ShowDate) + String(a.StartTime)).localeCompare(
				String(b.ShowDate) + String(b.StartTime),
			),
		);
}

function sectionInfo(i) {
	const base = "Book";
	if (!LIVE) return { label: "Peace Radio", btn: base };
	if (failed) return { label: "Unavailable", btn: base, dis: true };
	if (!loaded) return { label: "Loading…", btn: base, dis: true };
	const l = showsFor(i);
	if (!l.length)
		return { label: "No shows yet", btn: "No shows scheduled", dis: true };
	const n = l.reduce((a, x) => a + (+x.SeatsAvailable || 0), 0);
	return n
		? { label: n + " seats left", btn: base }
		: { label: "Fully booked", btn: "Fully booked", dis: true };
}

function dow(v) {
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ""));
	return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay() : -1;
}

function dayName(x) {
	return (
		[
			"Sunday",
			"Monday",
			"Tuesday",
			"Wednesday",
			"Thursday",
			"Friday",
			"Saturday",
		][dow(x.ShowDate)] || ""
	);
}

function t12(v) {
	const m = /(\d{1,2}):(\d{2})/.exec(String(v || ""));
	if (!m) return String(v || "");
	const h = +m[1];
	return (h % 12 || 12) + ":" + m[2] + " " + (h >= 12 ? "PM" : "AM");
}

function timeRange(x) {
	return [x.StartTime, x.EndTime].filter(Boolean).map(t12).join(" – ");
}

function esc(v) {
	return String(v).replace(
		/[&<>"']/g,
		(c) =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&#39;",
			})[c],
	);
}

function slotText(x, withDate) {
	return (
		dayName(x) +
		(withDate ? ", " + fmtDate(x.ShowDate) : "") +
		" · " +
		timeRange(x)
	);
}

function curSlots() {
	const x = liveShows.find(
		(x) => String(x.ShowID) === document.getElementById("slotPick").value,
	);
	return x ? [x] : [];
}

/* One dropdown per section: every Saturday and Sunday show of that section, sorted by day then time. */
function fillSlots(i, keep) {
	const sel = document.getElementById("slotPick"),
		list = showsFor(i);
	sel.innerHTML = "";
	if (!list.length) {
		sel.add(new Option("No shows available", ""));
		sel.disabled = true;
		return;
	}

	sel.disabled = false;
	sel.add(new Option("Select day & time", ""));
	const dates = {};
	list.forEach((x) => {
		const k = dow(x.ShowDate);
		(dates[k] = dates[k] || new Set()).add(x.ShowDate);
	});

	list.forEach((x) => {
		const full = !(+x.SeatsAvailable > 0),
			o = new Option(
				slotText(x, dates[dow(x.ShowDate)].size > 1) +
				(full ? " – Full" : ""),
				x.ShowID,
			);
		o.disabled = full;
		sel.add(o);
	});

	if (keep && [...sel.options].some((o) => o.value === keep && !o.disabled))
		sel.value = keep;
}

async function loadShows(silent) {
	const st = document.getElementById("status");
	try {
		const url = CONFIG.APPS_SCRIPT_URL.trim(),
			r = await fetch(
				url + (url.includes("?") ? "&" : "?") + "action=getShows",
			),
			d = await r.json();
		if (!d.ok) throw new Error(d.message || "Could not load shows.");
		liveShows = d.shows || [];
		loaded = true;
		failed = false;
		st.style.display = "none";
	} catch (e) {
		failed = !loaded;
		if (!silent || !loaded) {
			st.innerHTML =
				'ഷോ വിവരങ്ങൾ ലോഡ് ചെയ്യാനായില്ല. <button onclick="loadShows()">Retry</button>';
			st.style.display = "block";
		}
	}

	render();
	heroTick();
}

async function liveBook(name, mobile, m, f) {
	const picks = curSlots();
	if (!picks.length) {
		alert("Please select a show day and time.");
		return;
	}

	for (const sh of picks) {
		const ma = +sh.MaleAvailable || 0,
			fa = +sh.FemaleAvailable || 0;
		if (m > ma || f > fa) {
			alert(
				"Not enough seats for " +
				dayName(sh) +
				". Male left: " +
				ma +
				", Female left: " +
				fa +
				".",
			);
			return;
		}
	}

	const keep = document.getElementById("slotPick").value;
	const btn = document.getElementById("confirm"),
		label = btn.textContent;
	btn.disabled = true;
	btn.textContent = "Booking…";
	const done = [];
	let problem = "";
	try {
		try {
			for (const sh of picks) {
				const r = await fetch(CONFIG.APPS_SCRIPT_URL.trim(), {
					method: "POST",
					headers: { "Content-Type": "text/plain;charset=utf-8" },
					body: JSON.stringify({
						action: "book",
						showId: sh.ShowID,
						customerName: name,
						phone: mobile,
						maleTickets: m,
						femaleTickets: f,
					}),
				});
				const d = await r.json();
				if (!d.ok) {
					problem =
						dayName(sh) +
						": " +
						(d.message || "Booking failed. Please try again.");
					break;
				}

				done.push({ sh: sh, b: d.booking });
			}
		} catch (e) {
			problem =
				"Could not reach the booking server. Please check your connection and try again.";
		}

		if (problem)
			alert(
				done.length
					? "Booked: " +
					done.map((x) => dayName(x.sh)).join(", ") +
					". Not completed — " +
					problem
					: problem,
			);
		if (!done.length) {
			await loadShows();
			fillSlots(selectedIdx, keep);
			updateSummary();
			return;
		}

		const b0 = done[0].b,
			text = [
				"Peace Radio – Visual Theatre Booking",
				"Name: " + name,
				"Mobile: " + mobile,
				"Section: " + b0.documentaryTitle,
				"Duration: " + fmt(shows[selectedIdx][1]),
				"Male: " + b0.maleTickets,
				"Female: " + b0.femaleTickets,
				"Total tickets: " + b0.totalTickets,
				"",
			]
				.concat(
					done.map(
						(x) =>
							slotText(x.sh, true) +
							" — Booking ID: " +
							x.b.bookingId,
					),
				)
				.join("\n");
		waUrl = waBase() + "?text=" + encodeURIComponent(text);
		document.getElementById("ticketid").innerHTML = done
			.map((x) => esc(x.b.bookingId))
			.join("<br>");
		document.getElementById("ticketdetails").innerHTML = done
			.map(
				(x) =>
					esc(x.b.documentaryTitle) +
					" · " +
					slotText(x.sh, true) +
					" · " +
					x.b.totalTickets +
					" tickets",
			)
			.join("<br>");
		document.getElementById("confTitle").textContent = "Booking confirmed";
		document.getElementById("confNote").textContent =
			"നിങ്ങളുടെ Booking ID സൂക്ഷിച്ചുവെക്കുക — പ്രദർശന ദിവസം check-in-ന് ഇത് കാണിക്കണം. Booking വിവരങ്ങൾ WhatsApp വഴി Peace Radio-ന് അയയ്ക്കാൻ താഴെയുള്ള ബട്ടൺ അമർത്തുക.";
		document.getElementById("sendwa").textContent =
			"Send confirmation on WhatsApp";
		document.getElementById("sendwa").onclick = () =>
			window.open(waUrl, "_blank");
		document.getElementById("bookingform").style.display = "none";
		document.getElementById("confirmation").style.display = "block";
		loadShows();
	} finally {
		btn.disabled = false;
		btn.textContent = label;
	}
}

/* ===== Hero slideshow: now playing / up next (IST) ===== */
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
let heroAvail = ["hcStatic"],
	heroActive = "hcStatic",
	heroHover = false,
	heroPauseUntil = 0; /* after a manual slide, auto-rotation waits until this time */

function istNow() {
	const p = new Intl.DateTimeFormat("en-GB", {
		timeZone: "Asia/Kolkata",
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).formatToParts(
		new Date(Date.now() + (window.PREVIEW_OFFSET_MS || 0)),
	),
		g = (t) => +p.find((x) => x.type === t).value;
	return Date.UTC(
		g("year"),
		g("month") - 1,
		g("day"),
		g("hour"),
		g("minute"),
		g("second"),
	);
}

function sectionIndex(x) {
	const n = parseInt(x.DocumentaryID, 10);
	if (n >= 1 && n <= shows.length) return n - 1;
	return shows.findIndex((s) => s[0].trim() === String(x.Title || "").trim());
}

/* Sheet times are read as Indian Standard Time. Missing EndTime = start + section duration (or 60 min). */
function parseSlot(x) {
	const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(x.ShowDate || "")),
		a = /(\d{1,2}):(\d{2})/.exec(String(x.StartTime || ""));
	if (!d || !a) return null;
	const idx = sectionIndex(x),
		start = Date.UTC(+d[1], +d[2] - 1, +d[3], +a[1], +a[2]),
		b = /(\d{1,2}):(\d{2})/.exec(String(x.EndTime || ""));
	let end;
	if (b) {
		end = Date.UTC(+d[1], +d[2] - 1, +d[3], +b[1], +b[2]);
		if (end <= start) end += 864e5;
	} else
		end =
			start +
			(+x.Duration > 0 ? +x.Duration : idx >= 0 ? shows[idx][1] : 60) *
			60000;
	return { x, idx, start, end };
}

function hm(ms) {
	const d = new Date(ms);
	return (
		String(d.getUTCHours()).padStart(2, "0") +
		":" +
		String(d.getUTCMinutes()).padStart(2, "0")
	);
}

function relTxt(ms) {
	const m = Math.max(1, Math.ceil(ms / 60000));
	if (m < 60) return m + " min";
	const h = Math.floor(m / 60),
		r = m % 60;
	if (m < 1440) return h + "h" + (r ? " " + r + "m" : "");
	const dd = Math.floor(m / 1440),
		hh = h % 24;
	return dd + " day" + (dd > 1 ? "s" : "") + (hh ? " " + hh + "h" : "");
}

function dayTxt(ms) {
	const d = new Date(ms);
	return (
		WD[d.getUTCDay()] +
		", " +
		d.getUTCDate() +
		" " +
		MONTHS[d.getUTCMonth()]
	);
}

function whenTxt(ms, now) {
	const d = Math.floor(ms / 864e5) - Math.floor(now / 864e5);
	return (d === 0 ? "Today · " : d === 1 ? "Tomorrow · " : "") + dayTxt(ms);
}

/* Title, slot and timings all come from the sheet row (Title falls back to the section title if the cell is empty). */
function heroHTML(o, kind, now, more, gap) {
	const title =
		String(o.x.Title || "").trim() ||
		(o.idx >= 0 ? shows[o.idx][0] : "Visual Theatre"),
		sec =
			o.idx >= 0
				? "Section " + String(o.idx + 1).padStart(2, "0")
				: "Visual Theatre",
		live = kind === "now",
		sameDay = Math.floor(o.start / 864e5) === Math.floor(now / 864e5);
	const line1 = [sec, o.x.SlotType, more > 0 ? "+" + more + " more" : ""]
		.filter(Boolean)
		.join(" · "),
		line2 = live
			? "IST · Ends in " + relTxt(o.end - now)
			: (gap
				? sameDay
					? "Nothing playing right now · " + dayTxt(o.start)
					: "No show today · " + whenTxt(o.start, now)
				: whenTxt(o.start, now)) +
			" · Starts in " +
			relTxt(o.start - now);
	return (
		'<span class="hc-tag">' +
		(live ? "<i></i>NOW PLAYING" : "UP NEXT") +
		'</span><strong class="hc-title">' +
		esc(title) +
		"</strong><span>" +
		esc(line1) +
		'</span><hr style="border:0;border-top:1px solid #ffffff40;margin:18px 0"><strong>' +
		hm(o.start) +
		" – " +
		hm(o.end) +
		"</strong><span>" +
		esc(line2) +
		"</span>"
	);
}

let heroT = 0,
	heroCache =
		{}; /* data behind the live cards (hcNow / hcNext); the hero details modal reads it */
/* Re-checks the sheet schedule against the current IST time. Runs after every data load, at the exact moment a
   show starts or ends (so cards switch on time), at least every 30 s (for the countdowns), and when the tab wakes up. */
function heroTick() {
	const el = (id) => document.getElementById(id),
		now = istNow();
	let avail = [],
		edge = Infinity;
	heroCache = {};
	if (LIVE && loaded && !failed) {
		const list = liveShows
			.filter((x) => String(x.Status).toUpperCase() === "ACTIVE")
			.map(parseSlot)
			.filter(Boolean),
			by = (a, b) => a.start - b.start || a.idx - b.idx,
			cur = list.filter((o) => o.start <= now && now < o.end).sort(by),
			up = list.filter((o) => o.start > now).sort(by);
		list.forEach((o) =>
			[o.start, o.end].forEach((t) => {
				if (t > now && t < edge) edge = t;
			}),
		);
		const put = (id, o, kind, more, gap) => {
			heroCache[id] = { o, kind, more, gap };
			el(id).innerHTML = heroHTML(o, kind, now, more, gap);
			avail.push(id);
		};
		if (cur.length) put("hcNow", cur[0], "now", cur.length - 1, false);
		if (up.length)
			put(
				"hcNext",
				up[0],
				"next",
				up.filter((o) => o.start === up[0].start).length - 1,
				!cur.length,
			);
	}

	if (!avail.length) avail = ["hcStatic"];
	["hcStatic", "hcNow", "hcNext"].forEach((id) =>
		el(id).classList.toggle("gone", !avail.includes(id)),
	);
	if (!avail.includes(heroActive)) {
		["hcStatic", "hcNow", "hcNext"].forEach((id) =>
			el(id).classList.remove("active", "leaving"),
		);
		heroActive = avail[0];
		el(heroActive).classList.add("active");
	}

	heroAvail = avail;
	const dots = el("hcDots");
	dots.style.display = avail.length > 1 ? "flex" : "none";
	el("hcNav").style.display = avail.length > 1 ? "flex" : "none";
	dots.innerHTML = avail
		.map((id) => '<b class="' + (id === heroActive ? "on" : "") + '"></b>')
		.join("");
	heroSyncClickable();
	renderHeroModal();
	clearTimeout(heroT);
	heroT = setTimeout(
		heroTick,
		Math.min(30000, Math.max(1000, edge - now + 400)),
	);
}

/* Slides to the next (step 1) or previous (step -1) card. Used by the timer and by the arrows. */
function heroGo(step) {
	const n = heroAvail.length;
	if (n < 2) return;
	const next = heroAvail[(heroAvail.indexOf(heroActive) + step + n) % n],
		A = document.getElementById(heroActive),
		B = document.getElementById(next);
	document.querySelector(".hc-stage").classList.toggle("rev", step < 0);
	A.classList.remove("active");
	A.classList.add("leaving");
	B.classList.remove("leaving");
	B.classList.add("active");
	setTimeout(() => A.classList.remove("leaving"), 800);
	heroActive = next;
	document
		.querySelectorAll("#hcDots b")
		.forEach((b, i) =>
			b.classList.toggle("on", heroAvail[i] === heroActive),
		);
	heroSyncClickable();
}

function heroRotate() {
	if (heroAvail.length < 2 || heroHover || Date.now() < heroPauseUntil)
		return;
	heroGo(1);
}

/* Manual slide (arrows / keyboard): also holds off auto-rotation for a while so the card doesn't jump away. */
function heroManual(step) {
	heroPauseUntil = Date.now() + 12000;
	heroGo(step);
}

const grid = document.getElementById("grid");

function render() {
	let arr = shows.map((s, i) => ({ ...s, id: i + 1 }));
	document.getElementById("count").textContent =
		arr.length + (arr.length === 1 ? " Section" : " Sections");
	grid.innerHTML = arr.length
		? arr
			.map((s) => {
				const info = sectionInfo(s.id - 1);
				return `<article class="card"><div class="poster"><small>SECTION ${String(s.id).padStart(2, "0")}</small><img src="${thumbs[s.id - 1]}" alt="${s[0]}"></div><div class="cardbody"><h3>${s[0]}</h3><div class="meta"><span>◷ ${fmt(s[1])}</span><span>${info.label}</span></div><div class="cardbtns"><button class="ghost" onclick="openInfo(${s.id - 1})">കൂടുതൽ വിവരങ്ങൾ</button><button ${info.dis ? "disabled " : ""}onclick="openBooking(${s.id - 1})">${info.btn}</button></div></div></article>`;
			})
			.join("")
		: '<div class="empty">ഈ തിരച്ചിലിൽ section കണ്ടെത്താനായില്ല.</div>';
	if (window.syncInfoBook) syncInfoBook();
}

render();
let selected = null,
	waUrl = "";
const back = document.getElementById("modalback");

function syncModalState() {
	document.body.classList.toggle(
		"modal-open",
		back.classList.contains("open") ||
		infoBack.classList.contains("open") ||
		heroBack.classList.contains("open"),
	);
}

function openBooking(i) {
	selected = shows[i];
	document.getElementById("modalTitle").textContent = selected[0];
	document.getElementById("modalDuration").textContent = fmt(selected[1]);
	document.getElementById("bookingform").style.display = "block";
	document.getElementById("confirmation").style.display = "none";
	document.getElementById("customer").value = "";
	document.getElementById("mobile").value = "";
	document.getElementById("male").value = 0;
	document.getElementById("female").value = 0;
	selectedIdx = i;
	if (LIVE) fillSlots(i);
	updateSummary();
	back.classList.add("open");
	syncModalState();
}

function closeBooking() {
	back.classList.remove("open");
	syncModalState();
}

window.openBooking = openBooking;

/* ===== Section details modal (കൂടുതൽ വിവരങ്ങൾ). Booking itself is still the existing openBooking(). ===== */
const details = [
	[
		["ആത്മീയത നിറഞ്ഞ അറേബ്യ", 33],
		["സ്ക്രീൻ അഡിക്ഷൻ", 19],
		["മരണം", 6.5],
		["അടയാളങ്ങൾ ബാക്കിയാക്കുക", 5],
		["പലിശ", 3],
	],
	[
		["മുസ്ലിങ്ങൾ നൽകിയ ശാസ്ത്ര സംവിധാനം", 41],
		["വിമർശകർ പറയാൻ മറന്ന ഇസ്ലാം", 3],
		["മരണം 2", 7],
		["ഞാൻ ആരായിരിക്കണം", 7],
		["ജനസംഖ്യ പരിഹാരം", 5.5],
	],
	[
		["1921 പോരാട്ടവും നവോത്ഥാനവും", 52],
		["നാളേക്ക് വേണ്ടി വരുങ്ങാം", 4],
		["മരണം 3", 4],
		["ഫലസ്തീൻ ഡോക്യുമെന്ററി", 3],
		["സക്കാത്ത് നൽകിയാൽ", 3],
		["ക്യാമ്പസ് ഇനി എങ്ങനെയാവണം", 6],
	],
	[
		["വിജ്ഞാനം കൊണ്ട് ഭീകരതയെ നേരിടാം", 55],
		["സദാചാരം അശ്ലീല പദമല്ല", 5],
		["മരണം 4", 4],
		["ശിക്ഷകൾ മാതൃകയാക്കൽ", 3],
	],
	[
		["മനുഷ്യശരീരം ഡോക്യുമെന്ററി", 14],
		["രാജ്യം വിൽക്കപ്പെടും", 14],
		["മരണം 6", 6],
		["യുവത്വം ഡോക്യുമെന്ററി", 15.5],
		["ലഹരി", 7],
	],
	[
		["മുസ്ലിം അധിനിവേശങ്ങൾ", 10],
		["പരിഹാരം ഇസ്‌ലാം മാത്രം", 5],
		["പീസ് റേഡിയോയുടെ പ്രസക്തി", 10],
		["വ്യാജവാർത്തകൾ പടച്ചുവിടുമ്പോൾ", 7],
		["ഇന്ത്യ ഇന്ത്യക്കാരോട്", 4.25],
		["ശരി തെറ്റുകൾ നിശ്ചയിക്കുന്നത്", 5],
		["ഇസ്‌ലാമോഫോബിയ മൂല്യങ്ങൾ", 5],
	],
];
var infoIdx = -1;
const infoBack = document.getElementById("infoback");
/* The Book button in this modal mirrors the card's Book button (same label and disabled state). */
function syncInfoBook() {
	if (!(infoIdx >= 0)) return;
	const b = document.getElementById("infoBook"),
		i = sectionInfo(infoIdx);
	b.disabled = !!i.dis;
	b.textContent = i.btn;
}

function showInfo(i) {
	infoIdx = i;
	document.getElementById("infoPills").innerHTML = shows
		.map(
			(_, k) =>
				'<button type="button" class="pill' +
				(k === i ? " on" : "") +
				'" aria-pressed="' +
				(k === i) +
				'" aria-label="Section ' +
				(k + 1) +
				'" onclick="showInfo(' +
				k +
				')">' +
				(k + 1) +
				"</button>",
		)
		.join("");
	document.getElementById("infoSec").textContent =
		"SECTION " + String(i + 1).padStart(2, "0");
	document.getElementById("infoTitle").textContent = shows[i][0];
	document.getElementById("infoTotal").textContent =
		"ആകെ ദൈർഘ്യം: " + fmt(shows[i][1]);
	document.getElementById("infoList").innerHTML = details[i]
		.map(
			(d, k) =>
				'<li><span class="n">' +
				(k + 1) +
				'</span><span class="t">' +
				esc(d[0]) +
				'</span><span class="d">' +
				fmt(d[1]) +
				"</span></li>",
		)
		.join("");
	document.getElementById("infoScroll").scrollTop = 0;
	syncInfoBook();
}

function openInfo(i) {
	showInfo(i);
	infoBack.classList.add("open");
	syncModalState();
	document.getElementById("infoClose").focus();
}

function closeInfo() {
	infoBack.classList.remove("open");
	syncModalState();
}

window.openInfo = openInfo;
window.showInfo = showInfo;
document.getElementById("infoClose").onclick = closeInfo;
infoBack.addEventListener("click", (e) => {
	if (e.target === infoBack) closeInfo();
});
document.addEventListener("keydown", (e) => {
	if (e.key !== "Escape") return;
	if (infoBack.classList.contains("open")) closeInfo();
	else if (back.classList.contains("open")) {
		const active = document.activeElement;
		closeBooking();
		if (active.matches(".cardbtns button:not(.ghost)")) active.blur();
	}
});
document.getElementById("infoBook").onclick = () => {
	const i = infoIdx;
	closeInfo();
	openBooking(i);
};

/* ===== Hero card details modal =====
   Clicking a live hero card (Now playing / Up next) opens a larger view of it: the same card content (heroHTML),
   a QR code that opens that section's കൂടുതൽ വിവരങ്ങൾ modal, and a Book button. It stays open until closed. */
const heroBack = document.getElementById("heroback"),
	heroModal = heroBack.querySelector(".heromodal"),
	heroCardEl = document.getElementById("heroCard");
var heroPin = null; /* the show on screen in the modal: { key, idx, showId } */
const slotKey = (o) =>
	[o.x.ShowID, o.x.ShowDate, o.x.StartTime, o.idx].join("|");
/* Address that opens the കൂടുതൽ വിവരങ്ങൾ modal of section i (handled by openInfoFromHash below). */
function infoLink(i) {
	const u = new URL(location.href);
	u.search = "";
	u.hash = "info=" + (i + 1);
	return u.href;
}

function drawHeroQr(i) {
	try {
		const q = qrcode(0, "M");
		q.addData(infoLink(i));
		q.make();
		document.getElementById("heroQrImg").innerHTML = q.createSvgTag({
			cellSize: 4,
			margin: 12 /* 3 modules of white around the code, so phones can scan it reliably */,
			scalable: true,
			alt:
				"QR code: opens more information about Section " +
				String(i + 1).padStart(2, "0"),
		});
		return true;
	} catch (e) {
		return false;
	}
}

/* Seats left in one slot (a number), or null when the sheet row has no seat count. */
function slotSeats(x) {
	const n = +x.SeatsAvailable;
	return x.SeatsAvailable != null &&
		String(x.SeatsAvailable).trim() !== "" &&
		isFinite(n)
		? n
		: null;
}

/* Extra facts below the card: full date, section duration, seats left in this slot. */
function heroFactsHTML(o) {
	const x = o.x,
		rows = [
			[
				"Date",
				[dayName(x), fmtDate(x.ShowDate)].filter(Boolean).join(", "),
			],
		];
	if (o.idx >= 0) rows.push(["Duration", fmt(shows[o.idx][1])]);
	const n = slotSeats(x);
	if (n !== null)
		rows.push(["Seats left", n > 0 ? String(n) : "Fully booked"]);
	return rows
		.filter((r) => r[1])
		.map(
			(r) =>
				"<div><small>" +
				r[0] +
				"</small><b>" +
				esc(r[1]) +
				"</b></div>",
		)
		.join("");
}

/* Repaints the pinned show from the latest hero data, so the countdown and the Book button stay current. */
function renderHeroModal() {
	if (!heroPin) return;
	const ids = Object.keys(heroCache),
		id = ids.find((k) => slotKey(heroCache[k].o) === heroPin.key),
		c = heroCache[id];
	if (!c)
		return; /* show is no longer featured (ended or replaced): keep what is on screen */
	document.getElementById("heroPager").hidden = ids.length < 2;
	document.getElementById("heroPagerLabel").textContent =
		ids.indexOf(id) + 1 + " / " + ids.length;
	document.getElementById("heroDetail").innerHTML = heroHTML(
		c.o,
		c.kind,
		istNow(),
		c.more,
		c.gap,
	);
	document.getElementById("heroFacts").innerHTML = heroFactsHTML(c.o);
	const b = document.getElementById("heroBook"),
		i = c.o.idx >= 0 ? sectionInfo(c.o.idx) : { btn: "Book", dis: true };
	/* This show's own seats: a sold-out slot can't be booked from here even if the section has other slots. */
	const soldOut = slotSeats(c.o.x) === 0;
	b.disabled = !!i.dis || soldOut;
	b.textContent = soldOut ? "Fully booked" : i.btn;
}

function pinHero(id) {
	const c = heroCache[id];
	if (!c) return;
	const idx = c.o.idx,
		hasQr = idx >= 0 && drawHeroQr(idx);
	heroModal.classList.toggle("noqr", !hasQr);
	heroModal.classList.toggle("noidx", idx < 0);
	heroPin = {
		key: slotKey(c.o),
		idx: idx,
		showId: String(c.o.x.ShowID || ""),
	};
	renderHeroModal();
}

function openHero() {
	if (!heroCache[heroActive]) return;
	pinHero(heroActive);
	heroBack.classList.add("open");
	syncModalState();
	document.getElementById("heroClose").focus();
}

/* Arrows inside the modal switch between the live shows (Now playing / Up next). */
function heroModalGo(step) {
	const ids = Object.keys(heroCache),
		n = ids.length;
	if (n < 2 || !heroPin) return;
	const cur = ids.findIndex((k) => slotKey(heroCache[k].o) === heroPin.key);
	pinHero(ids[(cur + step + n) % n]);
}

function closeHero(refocus) {
	heroPin = null;
	heroBack.classList.remove("open");
	syncModalState();
	if (refocus !== false && heroCardEl.tabIndex === 0)
		heroCardEl.focus({ preventScroll: true });
}

/* Only the live cards open the modal; the static intro card does nothing. */
function heroSyncClickable() {
	const live = !!heroCache[heroActive];
	heroCardEl.classList.toggle("is-link", live);
	if (live) {
		heroCardEl.setAttribute("role", "button");
		heroCardEl.setAttribute("aria-haspopup", "dialog");
		heroCardEl.tabIndex = 0;
	} else
		["role", "aria-haspopup", "tabindex"].forEach((a) =>
			heroCardEl.removeAttribute(a),
		);
}

heroCardEl.addEventListener("click", () => {
	if (heroCache[heroActive]) openHero();
});
heroCardEl.addEventListener("keydown", (e) => {
	if (e.target !== heroCardEl)
		return; /* keys on the arrow buttons are theirs */
	if ((e.key === "Enter" || e.key === " ") && heroCache[heroActive]) {
		e.preventDefault();
		openHero();
	} else if (e.key === "ArrowLeft") heroManual(-1);
	else if (e.key === "ArrowRight") heroManual(1);
});
/* The arrows sit inside the clickable card, so their clicks must not also open the modal. */
[
	["hcPrevBtn", -1],
	["hcNextBtn", 1],
].forEach(([id, step]) =>
	document.getElementById(id).addEventListener("click", (e) => {
		e.stopPropagation();
		heroManual(step);
	}),
);
document.getElementById("heroPrev").onclick = () => heroModalGo(-1);
document.getElementById("heroNextB").onclick = () => heroModalGo(1);
document.getElementById("heroClose").onclick = () => closeHero();
heroBack.addEventListener("click", (e) => {
	if (e.target === heroBack) closeHero();
});
document.addEventListener("keydown", (e) => {
	if (!heroBack.classList.contains("open")) return;
	if (e.key === "Escape") closeHero(false);
	else if (e.key === "ArrowLeft") heroModalGo(-1);
	else if (e.key === "ArrowRight") heroModalGo(1);
});
/* Book / കൂടുതൽ വിവരങ്ങൾ hand over to the existing modals; booking opens with this show's slot picked. */
document.getElementById("heroBook").onclick = () => {
	const p = heroPin;
	if (!p || p.idx < 0) return;
	closeHero(false);
	openBooking(p.idx);
	if (LIVE && p.showId) {
		fillSlots(p.idx, p.showId);
		updateSummary();
	}
};
document.getElementById("heroInfo").onclick = () => {
	const p = heroPin;
	if (!p || p.idx < 0) return;
	closeHero(false);
	openInfo(p.idx);
};
/* #info=N (N = section number) opens that section's കൂടുതൽ വിവരങ്ങൾ modal. This is what the QR code points to. */
function openInfoFromHash() {
	const m = /^#info=(\d+)$/.exec(location.hash);
	if (!m) return;
	try {
		history.replaceState(null, "", location.pathname + location.search);
	} catch (e) { }

	const n = +m[1];
	if (n >= 1 && n <= shows.length) openInfo(n - 1);
}

openInfoFromHash();
window.addEventListener("hashchange", openInfoFromHash);

function updateSummary() {
	let m = +document.getElementById("male").value || 0,
		f = +document.getElementById("female").value || 0,
		extra =
			"Demo capacity മാത്രം — live availability ഇനിയും connect ചെയ്തിട്ടില്ല.";
	if (LIVE) {
		const p = curSlots()[0];
		if (p) {
			const ma = +p.MaleAvailable || 0,
				fa = +p.FemaleAvailable || 0;
			document.getElementById("male").max = ma;
			document.getElementById("female").max = fa;
			extra =
				"<b>Selected: " +
				esc(slotText(p, true)) +
				"</b><br>Seats left — Male: " +
				ma +
				" · Female: " +
				fa;
		} else
			extra =
				"ഒരു day &amp; time തിരഞ്ഞെടുക്കൂ — seat availability ഇവിടെ കാണാം.";
	}

	document.getElementById("summary").innerHTML =
		`ആകെ ടിക്കറ്റുകൾ: <b>${m + f}</b><br>Male: ${m} · Female: ${f}<br>${extra}`;
}

document.getElementById("male").addEventListener("input", updateSummary);
document.getElementById("female").addEventListener("input", updateSummary);
document.getElementById("close").onclick = closeBooking;
document.getElementById("done").onclick = closeBooking;
back.addEventListener("click", (e) => {
	if (e.target === back) closeBooking();
});
document.getElementById("confirm").onclick = async () => {
	let name = document.getElementById("customer").value.trim(),
		mobile = document.getElementById("mobile").value.replace(/\D/g, ""),
		m = +document.getElementById("male").value || 0,
		f = +document.getElementById("female").value || 0,
		slot = document.getElementById("showtime").value;
	if (!name || mobile.length < 10 || m + f < 1) {
		alert("പേരും ശരിയായ mobile number-ഉം കുറഞ്ഞത് ഒരു ticket-ഉം നൽകുക.");
		return;
	}

	if (LIVE) {
		await liveBook(name, mobile, m, f);
		return;
	}

	let id = shortId();
	let msg = `Peace Radio – Visual Theatre Booking Request%0ABooking ID: ${id}%0AName: ${encodeURIComponent(name)}%0AMobile: ${mobile}%0ASection: ${encodeURIComponent(selected[0])}%0ADuration: ${encodeURIComponent(fmt(selected[1]))}%0ASlot: ${encodeURIComponent(slot)}%0AMale: ${m}%0AFemale: ${f}%0ATotal: ${m + f}%0APlease confirm my booking.`;
	waUrl = waBase() + "?text=" + msg;
	document.getElementById("ticketid").textContent = id;
	document.getElementById("ticketdetails").textContent =
		`${selected[0]} · ${slot} · ${m + f} tickets`;
	document.getElementById("bookingform").style.display = "none";
	document.getElementById("confirmation").style.display = "block";
	document.getElementById("sendwa").onclick = () =>
		window.open(waUrl, "_blank");
};
document.getElementById("showtime").addEventListener("change", updateSummary);

if (LIVE) {
	document.getElementById("confirm").textContent = "Confirm booking";
	document.getElementById("formNote").textContent =
		"ലൈവ് സീറ്റ് ലഭ്യത അനുസരിച്ച് booking ഉടൻ confirm ആകും. Booking ID സൂക്ഷിച്ചുവെക്കുക — check-in-ന് ആവശ്യമാണ്.";
	document.getElementById("demoNote").style.display = "none";
	document.getElementById("demoSlot").style.display = "none";
	document.getElementById("liveSlots").style.display = "block";
	document
		.getElementById("slotPick")
		.addEventListener("change", updateSummary);
	loadShows();
	setInterval(() => loadShows(true), 300000);
}

setInterval(heroRotate, 5500);
document.addEventListener("visibilitychange", () => {
	if (!document.hidden) {
		heroTick();
		if (LIVE) loadShows(true);
	}
});
const hc = document.getElementById("heroCard");
hc.addEventListener("pointerenter", (e) => {
	if (e.pointerType === "mouse") heroHover = true;
});
hc.addEventListener("pointerleave", () => (heroHover = false));
