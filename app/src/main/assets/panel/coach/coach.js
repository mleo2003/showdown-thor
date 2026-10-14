// Showdown Thor coach: training help for Random Battles on the bottom screen.
// - the foe's likely sets, from pkmn's random-battle data (randbats.js, refreshed by tools/update-coach-data.sh)
// - who moves first (stats, boosts, paralysis, Tailwind, Trick Room, weather abilities, a possible Choice Scarf)
// - damage both ways, from the Smogon damage calculator (calc-data.js + calc.js, @smogon/calc, MIT)
// - a suggested move, or a switch-in when the active Pokémon is in danger
// Everything is read from the battle snapshot; nothing is sent to the page. Guesses are labelled as guesses.
'use strict';

var Coach = (function () {
	var C = window.calc;
	var RB = window.THOR_RANDBATS || {};
	var cache = { key: '', out: null };
	var WEATHER = { sunnyday: 'Sun', raindance: 'Rain', sandstorm: 'Sand', hail: 'Hail', snow: 'Snow', snowscape: 'Snow',
		desolateland: 'Harsh Sunshine', primordialsea: 'Heavy Rain', deltastream: 'Strong Winds' };
	var TERRAIN = { 'Electric Terrain': 'Electric', 'Grassy Terrain': 'Grassy', 'Misty Terrain': 'Misty', 'Psychic Terrain': 'Psychic' };
	var STATUS = { brn: 'brn', par: 'par', psn: 'psn', tox: 'tox', slp: 'slp', frz: 'frz' };
	var SPEED_ABILITY = { 'Swift Swim': ['Rain', 'Heavy Rain'], 'Chlorophyll': ['Sun', 'Harsh Sunshine'], 'Sand Rush': ['Sand'],
		'Slush Rush': ['Snow', 'Hail'] };

	function toID(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
	function formatOf(s) { var m = /^battle-([a-z0-9]+)-/.exec(s.id || ''); return m ? m[1] : toID(s.tier); }

	// Which random-battle data applies (Blitz, unrated, etc. use the same sets as the main format)
	function setsFor(s) {
		var f = formatOf(s);
		if (!/random/.test(f) || /champions|hackmons|monotype|bss|factory|cap|babyrandom|multi|ffa|freeforall/.test(f)) return null;
		var gen = s.gen || 9;
		if (/doubles/.test(f)) return RB['gen' + gen + 'doubles'] || null;
		return RB['gen' + gen] || null;
	}
	function speciesSets(sets, species) {
		if (!sets || !species) return null;
		if (sets[species]) return sets[species];
		var base = species.split('-')[0];
		return sets[base] || null;
	}
	function roleList(entry) {
		if (!entry) return [];
		return Object.keys(entry.roles || {}).map(function (name) { var r = entry.roles[name]; r.name = name; return r; });
	}

	function boostsOf(b) {
		var out = {};
		Object.keys(b || {}).forEach(function (k) { if (k in { atk: 1, def: 1, spa: 1, spd: 1, spe: 1 }) out[k] = b[k]; });
		return out;
	}

	function makeMon(gen, p, opts) {
		var o = {
			level: parseInt(p.level, 10) || 100,
			evs: Object.assign({ hp: 84, atk: 84, def: 84, spa: 84, spd: 84, spe: 84 }, opts.evs || {}),
			ivs: Object.assign({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, opts.ivs || {}),
			boosts: boostsOf(p.boosts),
			status: STATUS[p.status] || ''
		};
		if (opts.item) o.item = opts.item;
		if (opts.ability) o.ability = opts.ability;
		if (p.tera) { o.teraType = p.tera; }
		var mon;
		try { mon = new C.Pokemon(gen, p.species, o); } catch (e) { return null; }
		if (opts.stats) { // our own Pokémon: the server's exact stats
			['atk', 'def', 'spa', 'spd', 'spe'].forEach(function (k) { if (opts.stats[k]) { mon.rawStats[k] = opts.stats[k]; mon.stats[k] = opts.stats[k]; } });
		}
		var max = mon.maxHP();
		mon.originalCurHP = p.exactHp && p.maxhp ? Math.max(0, Math.round(max * p.hp / p.maxhp)) : Math.max(0, Math.round(max * (p.pct || 0) / 100));
		return mon;
	}

	function field(gen, s, attackerIsMe) {
		var you = (s.you || {}).sc || {}, foe = (s.foe || {}).sc || {};
		function side(sc) {
			return new C.Side({ isReflect: !!sc.reflect, isLightScreen: !!sc.lightscreen, isAuroraVeil: !!sc.auroraveil,
				isTailwind: !!sc.tailwind, spikes: sc.spikes || 0, isSR: !!sc.stealthrock });
		}
		var terrain = null;
		(s.pseudo || []).forEach(function (w) { if (TERRAIN[w]) terrain = TERRAIN[w]; });
		return new C.Field({
			gameType: ((s.you || {}).active || []).length > 1 ? 'Doubles' : 'Singles',
			weather: WEATHER[toID(s.weather)] || undefined, terrain: terrain || undefined,
			isGravity: (s.pseudo || []).indexOf('Gravity') >= 0,
			attackerSide: side(attackerIsMe ? you : foe), defenderSide: side(attackerIsMe ? foe : you)
		});
	}

	function hit(gen, att, def, moveName, fld, extra) {
		var mv;
		try { mv = new C.Move(gen, moveName, extra || {}); } catch (e) { return null; }
		if (mv.category === 'Status' || !mv.bp) return null;
		var r;
		try { r = C.calculate(gen, att, def, mv, fld); } catch (e) { return null; }
		var rng = r.range(), max = def.maxHP();
		if (!max || !rng[1]) return { min: 0, max: 0, ko: '', koN: 0, chance: 0, prio: mv.priority || 0 };
		var ko = {};
		try { ko = r.kochance(false) || {}; } catch (e) {}
		return { min: Math.round(100 * rng[0] / max), max: Math.round(100 * rng[1] / max), ko: ko.text || '', koN: ko.n || 0,
			chance: ko.chance || 0, prio: mv.priority || 0, cur: def.curHP() / max };
	}

	// Speed: the stat, its stage, and what changes turn order
	function stageMul(b) { b = b || 0; return b >= 0 ? (2 + b) / 2 : 2 / (2 - b); }
	function speedOf(base, p, s, sc, opts) {
		var v = Math.floor(base * stageMul((p.boosts || {}).spe));
		if (p.status === 'par') v = Math.floor(v / 2);
		if (sc && sc.tailwind) v *= 2;
		var w = WEATHER[toID(s.weather)];
		if (opts.ability && SPEED_ABILITY[opts.ability] && SPEED_ABILITY[opts.ability].indexOf(w) >= 0) v *= 2;
		if (opts.item === 'Choice Scarf') v = Math.floor(v * 1.5);
		return v;
	}

	function analyze(s) {
		if (!C || !s || s.mode !== 'battle' || s.spectator) return null;
		var me = (s.you && s.you.active || [])[0], foe = (s.foe && s.foe.active || [])[0];
		var forced = !!(me && me.fainted) && ((s.controls || {}).switches || []).length > 0 && !((s.controls || {}).moves || []).length;
		if (!me || !foe || foe.fainted || (me.fainted && !forced)) return null;
		var key = JSON.stringify([s.id, s.turn, me, foe, s.weather, s.pseudo, (s.you || {}).sc, (s.foe || {}).sc,
			(s.controls || {}).moves && s.controls.moves.map(function (m) { return m.value + m.name; }),
			(s.team || []).map(function (t) { return t.species + t.hp + t.fainted; })]);
		if (cache.key === key) return cache.out;
		var out = null;
		try { out = run(s, me, foe); } catch (e) { out = { error: String(e && e.message || e) }; }
		cache = { key: key, out: out };
		return out;
	}

	function run(s, me, foe) {
		var gen = C.Generations.get(s.gen || 9);
		var sets = setsFor(s);
		var entry = speciesSets(sets, foe.species);
		var roles = roleList(entry);
		var revealedItem = foe.item || '', revealedAbility = foe.ability || '', itemGone = !!foe.itemGone;
		var meTeam = (s.team || []).filter(function (t) { return t.active; })[0] || {};
		var myOpts = { stats: me.stats || meTeam.stats, item: me.item || meTeam.item, ability: me.ability || meTeam.ability };
		var mine = me.fainted ? null : makeMon(gen, me, myOpts);
		if (!mine && !me.fainted) return null;

		// One calc Pokémon per possible foe set (unknown item/ability: that set's own options)
		var foeSets = (roles.length ? roles : [{ name: 'unknown set', items: [], abilities: [], moves: [] }]).map(function (r) {
			var item = itemGone ? '' : revealedItem || (r.items && r.items.length === 1 ? r.items[0] : '');
			var ability = revealedAbility || (r.abilities && r.abilities[0]) || (entry && entry.abilities && entry.abilities[0]) || '';
			var level = foe.level || (entry && entry.level) || 100;
			var mon = makeMon(gen, Object.assign({}, foe, { level: level }), { evs: r.evs, ivs: r.ivs, item: item, ability: ability });
			return { role: r, mon: mon, item: item, ability: ability };
		}).filter(function (x) { return x.mon; });
		if (!foeSets.length) return null;
		if (!mine) return forcedSwitch(gen, s, foe, foeSets, entry, revealedItem, revealedAbility, !!sets);

		// Your moves against each possible set: the range across sets
		var moves = {};
		((s.controls || {}).moves || []).forEach(function (m) {
			if (m.disabled) return;
			var rs = foeSets.map(function (f) { return hit(gen, mine, f.mon, m.name, field(gen, s, true)); }).filter(Boolean);
			if (!rs.length) return;
			var lo = Math.min.apply(null, rs.map(function (r) { return r.min; })), hi = Math.max.apply(null, rs.map(function (r) { return r.max; }));
			var koAll = rs.every(function (r) { return r.koN === 1 && r.chance >= 1; }), koSome = rs.some(function (r) { return r.koN === 1 && r.chance > 0; });
			var n = Math.max.apply(null, rs.map(function (r) { return r.koN || 9; }));
			moves[m.value] = { name: m.name, min: lo, max: hi, prio: rs[0].prio, acc: m.acc || 100, ohko: koAll ? 'yes' : koSome ? 'maybe' : '',
				ko: koAll ? 'KOs' : koSome ? 'may KO' : n < 9 ? n + 'HKO' : '' };
		});

		// The foe's possible moves against you: revealed ones + every move in its possible sets
		var foeMoves = {};
		(foe.moves || []).forEach(function (n) { foeMoves[n] = true; });
		foeSets.forEach(function (f) { (f.role.moves || []).forEach(function (n) { foeMoves[n] = true; }); });
		var threats = Object.keys(foeMoves).map(function (n) {
			var rs = foeSets.filter(function (f) { return !f.role.moves || !f.role.moves.length || f.role.moves.indexOf(n) >= 0 || (foe.moves || []).indexOf(n) >= 0; })
				.map(function (f) {
					// an unknown item could be a boosting one: try the set's options and keep the strongest
					var items = itemGone ? [''] : revealedItem ? [revealedItem] : (f.role.items && f.role.items.length ? f.role.items : ['']);
					return items.map(function (it) {
						var mon = it === f.item ? f.mon : makeMon(gen, Object.assign({}, foe, { level: f.mon.level }), { evs: f.role.evs, ivs: f.role.ivs, item: it, ability: f.ability });
						return mon && hit(gen, mon, mine, n, field(gen, s, false));
					}).filter(Boolean);
				}).reduce(function (a, b) { return a.concat(b); }, []);
			if (!rs.length) return null;
			return { name: n, seen: (foe.moves || []).indexOf(n) >= 0, min: Math.min.apply(null, rs.map(function (r) { return r.min; })),
				max: Math.max.apply(null, rs.map(function (r) { return r.max; })), prio: rs[0].prio,
				ko: rs.some(function (r) { return r.koN === 1 && r.chance > 0; }) };
		}).filter(Boolean).sort(function (a, b) { return b.max - a.max; });

		// Turn order
		var mySpe = speedOf(mine.rawStats.spe, me, s, (s.you || {}).sc, myOpts);
		var foeBase = foeSets[0].mon.rawStats.spe;
		var foeSpe = speedOf(foeBase, foe, s, (s.foe || {}).sc, { ability: foeSets[0].ability, item: revealedItem });
		var scarfPossible = !revealedItem && !itemGone && foeSets.some(function (f) { return (f.role.items || []).indexOf('Choice Scarf') >= 0; });
		var foeScarf = scarfPossible ? speedOf(foeBase, foe, s, (s.foe || {}).sc, { ability: foeSets[0].ability, item: 'Choice Scarf' }) : 0;
		var tr = (s.pseudo || []).indexOf('Trick Room') >= 0;
		function first(a, b) { return a === b ? 'tie' : (a > b) !== tr ? 'you' : 'foe'; }
		var speed = { you: mySpe, foe: foeSpe, scarf: foeScarf, trickRoom: tr, first: first(mySpe, foeSpe),
			firstVsScarf: foeScarf ? first(mySpe, foeScarf) : '' };

		var myPct = me.exactHp && me.maxhp ? Math.round(100 * me.hp / me.maxhp) : me.pct;
		var danger = threats.filter(function (t) { return t.max >= myPct; });
		var outspedBy = speed.first === 'foe' || speed.firstVsScarf === 'foe';

		// The pick: a sure KO (priority first if they'd move first), else the most damage; a switch when you'd go down first
		var list = Object.keys(moves).map(function (v) { return Object.assign({ value: v }, moves[v]); });
		var kos = list.filter(function (m) { return m.ohko === 'yes'; });
		var best = null, why = '';
		function exp(m) { return (m.min + m.max) / 2 * (m.acc || 100) / 100; }
		if (kos.length) {
			best = kos.filter(function (m) { return m.prio > 0; })[0] || kos.sort(function (a, b) { return (b.acc || 100) - (a.acc || 100) || b.min - a.min; })[0];
			why = best.prio > 0 && outspedBy ? 'priority, and it KOs' : speed.first === 'you' ? 'you move first and it KOs' : 'it KOs';
			if (best.acc < 100) why += ' (' + best.acc + '% accurate)';
			if (outspedBy && best.prio <= 0 && danger.length) why += ', but they move first and ' + danger[0].name + ' could KO you';
		} else if (list.length) {
			best = list.sort(function (a, b) { return exp(b) - exp(a); })[0];
			why = best.max > 0 ? (best.ohko === 'maybe' ? 'may KO (' : 'most damage (') + best.min + '–' + best.max + '%' +
				(best.acc < 100 ? ', ' + best.acc + '% accurate' : '') + ')' : '';
		}
		var pick = best && best.max > 0 ? { kind: 'move', value: best.value, name: best.name, why: why } : null;

		// Switch-ins: who takes the foe's best hits best, and how hard they hit back
		var bench = [];
		var topThreats = threats.slice(0, 4);
		(s.team || []).forEach(function (t) {
			if (t.active || t.fainted || !t.hp) return;
			var mon = makeMon(gen, { species: t.species, level: t.level, hp: t.hp, maxhp: t.maxhp, exactHp: true, boosts: {}, status: t.status },
				{ stats: t.stats, item: t.item, ability: t.ability });
			if (!mon) return;
			var taken = 0, takenBy = '';
			topThreats.forEach(function (th) {
				foeSets.forEach(function (f) {
					var r = hit(gen, f.mon, mon, th.name, field(gen, s, false));
					if (r && r.max > taken) { taken = r.max; takenBy = th.name; }
				});
			});
			var dealt = 0, dealtBy = '';
			(t.moves || []).forEach(function (m) {
				var r = hit(gen, mon, foeSets[0].mon, m.name, field(gen, s, true));
				if (r && r.max > dealt) { dealt = r.max; dealtBy = m.name; }
			});
			bench.push({ index: t.index, name: t.name, species: t.species, hpPct: t.maxhp ? Math.round(100 * t.hp / t.maxhp) : 0,
				taken: taken, takenBy: takenBy, dealt: dealt, dealtBy: dealtBy });
		});
		bench.sort(function (a, b) { return (a.taken - a.dealt / 2) - (b.taken - b.dealt / 2); });
		var cantWin = outspedBy && danger.length && !(best && best.ohko === 'yes' && (best.prio > 0 || speed.first === 'you'));
		var sw = bench.filter(function (b) { return b.taken < Math.min(50, b.hpPct); })[0];
		if (cantWin && sw && ((s.controls || {}).switches || []).length) {
			pick = { kind: 'switch', index: sw.index, name: sw.name, why: 'they move first and ' + danger[0].name + ' (up to ' + danger[0].max +
				'%) could KO; ' + sw.name + ' takes at most ' + sw.taken + '% from their moves and hits back ' + sw.dealt + '% with ' + sw.dealtBy };
		}

		return {
			data: !!sets, foeName: foe.species, level: foeSets[0].mon.level,
			sets: foeSets.map(function (f) { var r = f.role; return { name: r.name, moves: r.moves || [], items: r.items || [],
				abilities: r.abilities || [], tera: r.teraTypes || [] }; }),
			revealed: { item: revealedItem, itemGone: itemGone, ability: revealedAbility, moves: foe.moves || [] },
			moves: moves, threats: threats, speed: speed, danger: danger.map(function (t) { return t.name; }),
			pick: pick, bench: bench.slice(0, 5)
		};
	}

	// After a faint: who comes in best (least damage from the foe's likely moves, most damage back)
	function forcedSwitch(gen, s, foe, foeSets, entry, revealedItem, revealedAbility, hasData) {
		var foeMoves = {};
		(foe.moves || []).forEach(function (n) { foeMoves[n] = true; });
		foeSets.forEach(function (f) { (f.role.moves || []).forEach(function (n) { foeMoves[n] = true; }); });
		var bench = [];
		(s.team || []).forEach(function (t) {
			if (t.active || t.fainted || !t.hp) return;
			var mon = makeMon(gen, { species: t.species, level: t.level, hp: t.hp, maxhp: t.maxhp, exactHp: true, boosts: {}, status: t.status },
				{ stats: t.stats, item: t.item, ability: t.ability });
			if (!mon) return;
			var taken = 0, takenBy = '', dealt = 0, dealtBy = '';
			Object.keys(foeMoves).forEach(function (n) {
				foeSets.forEach(function (f) { var r = hit(gen, f.mon, mon, n, field(gen, s, false)); if (r && r.max > taken) { taken = r.max; takenBy = n; } });
			});
			(t.moves || []).forEach(function (m) {
				var r = hit(gen, mon, foeSets[0].mon, m.name, field(gen, s, true)); if (r && r.max > dealt) { dealt = r.max; dealtBy = m.name; }
			});
			var sp = speedOf(mon.rawStats.spe, { boosts: {}, status: t.status }, s, (s.you || {}).sc, { item: t.item, ability: t.ability });
			var fs = speedOf(foeSets[0].mon.rawStats.spe, foe, s, (s.foe || {}).sc, { ability: foeSets[0].ability, item: revealedItem });
			bench.push({ index: t.index, name: t.name, species: t.species, hpPct: t.maxhp ? Math.round(100 * t.hp / t.maxhp) : 0,
				taken: taken, takenBy: takenBy, dealt: dealt, dealtBy: dealtBy, faster: sp > fs });
		});
		// Coming in after a faint costs no hit, so favour who hits hardest and is faster, then who takes least
		bench.sort(function (a, b) {
			var foePct = foe.pct || 100;
			function score(x) {
				var koes = x.dealt >= foePct && (x.faster || x.taken < x.hpPct); // KOs before it can be KO'd
				return Math.min(x.dealt, 100) + (x.faster ? 25 : 0) - Math.min(x.taken, 100) / 2 - (x.taken >= x.hpPct ? 40 : 0) + (koes ? 50 : 0);
			}
			return score(b) - score(a);
		});
		var best = bench[0];
		return { data: hasData, forced: true, foeName: foe.species, level: foeSets[0].mon.level,
			sets: foeSets.map(function (f) { var r = f.role; return { name: r.name, moves: r.moves || [], items: r.items || [], abilities: r.abilities || [], tera: r.teraTypes || [] }; }),
			revealed: { item: revealedItem, ability: revealedAbility, moves: foe.moves || [] }, moves: {}, threats: [], danger: [], speed: null,
			pick: best ? { kind: 'switch', index: best.index, name: best.name, why: (best.faster ? 'faster, ' : '') + (best.dealt >= (foe.pct || 100) ? 'KOs with ' + best.dealtBy + ' (' + best.dealt + '%)' : 'hits ' + best.dealt + '% with ' + best.dealtBy) +
				', takes at most ' + best.taken + '%' } : null, bench: bench.slice(0, 5) };
	}

	return { analyze: analyze, ready: !!C };
})();

window.Coach = Coach;
