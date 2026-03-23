#!/usr/bin/env node
/**
 * One-time migration script: carries translation values from old (v1) keys
 * to new (v2) keys by matching on the `original` text.
 *
 * Run AFTER: astro build -> rosey generate -> write-locales
 * (so the locale files contain both orphaned old keys and new empty keys)
 *
 * Usage: node scripts/remap-locale-keys.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readdirSync } from "node:fs";

const LOCALES_DIR = join(process.cwd(), "rosey", "locales");

const files = readdirSync(LOCALES_DIR).filter(
	(f) => f.endsWith(".json") && !f.includes(".urls."),
);

for (const file of files) {
	const filePath = join(LOCALES_DIR, file);
	const locale = JSON.parse(readFileSync(filePath, "utf-8"));

	// Build a lookup: normalized original text -> { key, value }
	// Prioritize entries that have a non-empty value
	const byOriginal = new Map();
	for (const [key, entry] of Object.entries(locale)) {
		const orig = (entry.original || "").trim();
		if (!orig) continue;
		const existing = byOriginal.get(orig);
		if (!existing || (!existing.value && entry.value)) {
			byOriginal.set(orig, { key, value: entry.value });
		}
	}

	let remapped = 0;
	let orphansRemoved = 0;
	const newKeys = new Set();

	// Pass 1: populate empty values from matching originals
	for (const [key, entry] of Object.entries(locale)) {
		const orig = (entry.original || "").trim();
		if (!orig) continue;

		if (!entry.value || entry.value.trim() === "") {
			const match = byOriginal.get(orig);
			if (match && match.value && match.key !== key) {
				entry.value = match.value;
				remapped++;
				console.log(`  ${file}: "${key}" <- value from "${match.key}"`);
			}
		}

		// Track keys that have _base_original (these are the live/new keys from write-locales)
		if (entry._base_original !== undefined) {
			newKeys.add(key);
		}
	}

	// Pass 2: remove orphaned old keys (those without _base_original)
	// Only if write-locales has been run (i.e. some keys have _base_original)
	if (newKeys.size > 0) {
		for (const key of Object.keys(locale)) {
			if (!newKeys.has(key)) {
				orphansRemoved++;
				delete locale[key];
			}
		}
	}

	writeFileSync(filePath, JSON.stringify(locale, null, "\t") + "\n");
	console.log(
		`${file}: ${remapped} values remapped, ${orphansRemoved} orphaned keys removed`,
	);
}
