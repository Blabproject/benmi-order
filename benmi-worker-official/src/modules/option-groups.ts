import { Env } from '../types/env';
import { json } from '../utils/http';
import { getTenantId } from './menu';
import { invalidateBootstrapCache } from './bootstrap';
import { deleteTenantImageFromR2AndD1 } from './image';
import { pricingRustEnabled, callRustValidateUnifiedItems, callRustValidateCatalogGraph } from './pricing-engine-client';

type Row = Record<string, any>;
type SubOption = {
	id?: string;
	name: string;
	price?: number;
	productId?: string;
	isOutOfStock?: boolean;
	isOos?: boolean;
};
const subKey = (sub: string | SubOption) => typeof sub === 'string' ? sub : sub?.id || sub?.productId || sub?.name;
export type MenuOption = {
	id: string;
	name: string;
	price: number;
	productId: string | null;
	quantity: number;
	isDefault: boolean;
	isOutOfStock: boolean;
	outOfStockUntil: string | null;
	subOptions: any[];
	eligibilityRules: any[];
	description: string | null;
	[key: string]: any;
};
export type OptionGroup = {
	id: string;
	name: string;
	scope: string;
	minSelection: number;
	maxSelection: number;
	allowRepeats: boolean;
	included: boolean;
	autoPopup?: boolean;
	options: MenuOption[];
	sources: any[];
	labels: Record<string, string>;
	revision: number;
	[key: string]: any;
};
export type OptionCatalog = {
	products: Row[];
	categories: Row[];
	groups: OptionGroup[];
	links: Row[];
	categoryLinks: Row[];
	revision?: number;
	imageList?: string[];
};
const parse = (value: any, fallback: any) => {
	if (typeof value !== 'string') return value ?? fallback;
	try {
		return JSON.parse(value);
	} catch {
		throw new Error('INVALID_STORED_OPTIONS');
	}
};
const money = (v: any) => Number.isFinite(Number(v)) && Number(v) >= 0 && Math.abs(Number(v) * 100 - Math.round(Number(v) * 100)) < 0.00001;
const integer = (v: any, min = 0) => Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= 999;
const parseUtc = (s: string) => {
	if (!s) return 0;
	const norm = s.includes('T') ? (s.endsWith('Z') || s.includes('+') ? s : s + 'Z') : s.replace(' ', 'T') + 'Z';
	return Date.parse(norm) || Date.parse(s);
};
const oos = (row: Row) => Boolean(row.is_out_of_stock || (row.out_of_stock_until && parseUtc(row.out_of_stock_until) > Date.now()));
export const unifiedMenuEnabled = (env: Env) => env.UNIFIED_MENU_ENABLED !== 'false';

export async function loadOptionCatalog(env: Env, tenantId: string): Promise<OptionCatalog> {
	const tables = ['menu_items', 'menu_categories', 'modifier_groups', 'modifier_options', 'item_modifier_links', 'category_modifier_links'];
	const results = await env.DB.batch([
		...tables.map((table) => env.DB.prepare(`SELECT * FROM ${table} WHERE tenant_id = ? ORDER BY sort_order`).bind(tenantId)),
		env.DB.prepare('SELECT revision FROM menu_catalog_revisions WHERE tenant_id=?').bind(tenantId),
	]);
	if (results.some((r) => !r.success)) throw new Error('MENU_UNAVAILABLE');
	const [products, categories, groups, options, links, categoryLinks] = results.map((r) => r.results as Row[]);
	const normalized: OptionGroup[] = groups.map((g) => {
		const metadata = parse(g.source_metadata_json, {});
		const minSelection = Math.max(Number(g.min_selection || 0), g.is_required ? 1 : 0);
		const included = Boolean(g.included);
		const autoPopup = included || minSelection > 0;
		const totalOptions = options.filter((o) => o.group_id === g.id).length;
		let maxSelection = Number(g.max_selection || (g.selection_type === 'single' ? 1 : 999));
		if (!Boolean(g.allow_repeats) && totalOptions > 0 && maxSelection > totalOptions && (!g.max_selection || Number(g.max_selection) >= 99)) {
			maxSelection = totalOptions;
		}
		return {
			id: g.id,
			name: g.name,
			scope: g.scope || 'item',
			minSelection,
			maxSelection,
			allowRepeats: Boolean(g.allow_repeats),
			included,
			autoPopup,
			sources: parse(g.sources_json, []),
			labels: parse(g.labels_json, {}),
			revision: Number(g.revision || 0),
			metadata,
			sortOrder: Number(g.sort_order || 0),
			options: options
				.filter((o) => o.group_id === g.id)
				.map((o) => ({
					id: o.id,
					name: o.name,
					price: Number(o.price),
					productId: o.product_id || null,
					quantity: Number(o.included_quantity || 1),
					isDefault: Boolean(o.is_default),
					isOutOfStock: oos(o),
					isLocallyOutOfStock: Boolean(o.is_out_of_stock),
					metadata: parse(o.source_metadata_json, {}),
					outOfStockUntil: o.out_of_stock_until || null,
					subOptions: parse(o.sub_options_json, []),
					eligibilityRules: parse(o.eligibility_rules_json, []),
					description: o.description || null,
				})),
		};
	});
	let imageList: string[] | undefined = undefined;
	const imageNamesSet = new Set<string>();
	let hasAuthoritativeImageSource = Boolean(env.IMAGES_BUCKET);
	if (env.DB) {
		try {
			const imgRes = await env.DB.prepare('SELECT name, bare_name FROM tenant_images WHERE tenant_id = ?').bind(tenantId).all<Row>();
			if (imgRes && Array.isArray(imgRes.results)) {
				if (imgRes.results.length > 0) hasAuthoritativeImageSource = true;
				for (const r of imgRes.results) {
					if (r.name) imageNamesSet.add(String(r.name));
					if (r.bare_name) imageNamesSet.add(String(r.bare_name));
				}
			}
		} catch {}
	}
	if (env.ORDER_STATE && typeof env.ORDER_STATE.get === 'function') {
		try {
			const listRaw = await env.ORDER_STATE.get(`tenant:${tenantId}:image_list`);
			if (listRaw) {
				const parsed = JSON.parse(listRaw);
				if (Array.isArray(parsed)) {
					hasAuthoritativeImageSource = true;
					for (const k of parsed) if (k) imageNamesSet.add(String(k));
				}
			}
		} catch {}
	}
	if (hasAuthoritativeImageSource) {
		imageList = Array.from(imageNamesSet);
	}
	const catalog = {
		revision: Number((results[6].results[0] as Row)?.revision || 0),
		products,
		categories: categories.filter((c) => !['order_customization', 'bundle_pool'].includes(c.category_type)),
		groups: normalized,
		links: links.map((l) => ({
			itemId: l.item_id,
			groupId: l.group_id,
			optionIds: parse(l.option_ids_json, null),
			disabled: Boolean(l.is_disabled),
		})),
		categoryLinks: [],
		imageList,
	};
	return catalog;
}

/** Resolve live product data. A retail price is never a surcharge. */
export function groupOptions(catalog: OptionCatalog, group: OptionGroup): MenuOption[] {
	const options = (group.options || []).map((o) => ({ ...o }));
	const seen = new Set(options.map((o) => o.productId).filter(Boolean));
	for (const source of group.sources || []) {
		for (const product of catalog.products) {
			const matches =
				source.type === 'category'
					? product.category_id === (source.refId || source.categoryId)
					: source.type === 'item_list' && source.itemIds?.includes(product.id);
			if (!matches || seen.has(product.id)) continue;
			seen.add(product.id);
			options.push({
				id: `source:${group.id}:${product.id}`,
				name: product.name,
				productId: product.id,
				price: Number(group.metadata?.legacySurcharges?.[product.id] || 0),
				quantity: 1,
				isDefault: false,
				isOutOfStock: false,
				outOfStockUntil: null,
				subOptions: [],
				eligibilityRules: [],
				description: null,
				fromSource: true,
			});
		}
	}
	return options.map((o) => {
		const product = o.productId ? catalog.products.find((p) => p.id === o.productId) : null;
		return {
			...o,
			name: product?.name || o.name,
			retailPrice: product?.price,
			subOptions: (o.subOptions || []).map((sub: string | SubOption) => {
				if (typeof sub === 'string' || !sub.productId) return sub;
				const linked = catalog.products.find((p) => p.id === sub.productId);
				return {
					...sub,
					id: sub.id || `product:${sub.productId}`,
					name: linked?.name || sub.name,
					retailPrice: linked?.price,
					isOutOfStock: !linked || oos(linked),
				};
			}),
			imageUrl:
				product && product.image_key && product.image_key.trim() !== '' && (!catalog.imageList || catalog.imageList.includes(product.image_key))
					? `/api/image?tenant_id=${encodeURIComponent(product.tenant_id)}&name=${encodeURIComponent(product.image_key)}`
					: null,
			isOutOfStock: o.isOutOfStock || Boolean(o.productId && (!product || oos(product))),
		};
	});
}
export function effectiveGroups(catalog: OptionCatalog, productId: string): OptionGroup[] {
	const product = catalog.products.find((p) => p.id === productId);
	if (!product) throw new Error('PRODUCT_NOT_FOUND');
	const direct = catalog.links.filter((l) => l.itemId === productId);
	return direct
		.filter((l) => !l.disabled)
		.map((link) => {
			const group = catalog.groups.find((g) => g.id === link.groupId);
			if (!group || group.scope === 'order') return null;
			const options = groupOptions(catalog, group).filter((o) => !Array.isArray(link.optionIds) || link.optionIds.includes(o.id));
			return { ...group, options, inherited: false, optionIds: link.optionIds ?? null };
		})
		.filter(Boolean) as OptionGroup[];
}
export function validateOptionGraph(catalog: OptionCatalog) {
	// Guard against direct self-links: a group cannot be linked to a product that is an option within that group
	for (const link of catalog.links) {
		if (link.disabled) continue;
		const group = catalog.groups.find((g) => g.id === link.groupId);
		if (!group) continue;
		const opts = groupOptions(catalog, group);
		if (opts.some((o) => o.productId === link.itemId)) {
			throw new Error('OPTION_PRODUCT_CYCLE');
		}
	}
	const visiting = new Set<string>();
	const done = new Set<string>();
	function visit(id: string, depth: number) {
		if (visiting.has(id)) throw new Error('OPTION_PRODUCT_CYCLE');
		if (depth > 12) throw new Error('OPTION_DEPTH_LIMIT');
		if (done.has(id)) return;
		visiting.add(id);
		for (const group of effectiveGroups(catalog, id)) {
			const total = group.included ? group.options.reduce((sum, o) => sum + o.quantity, 0) : group.options.length;
			if (
				(group.included && (total < group.minSelection || total > group.maxSelection || !total)) ||
				(group.minSelection > 0 && !total) ||
				(!group.allowRepeats && !group.included && total < group.minSelection)
			)
				throw new Error(`INSUFFICIENT_OPTIONS:${group.id}`);
			for (const option of group.options) if (option.productId) visit(option.productId, depth + 1);
		}
		visiting.delete(id);
		done.add(id);
	}
	for (const product of catalog.products) visit(product.id, 0);
}

/** Compatibility projection only. Canonical groups are the sole configuration authority. */
export function projectOptionRule(catalog: OptionCatalog, productId: string, path: string[] = [], groupPath: string[] = []): any {
	if (path.includes(productId) || path.length > 12) throw new Error('OPTION_PRODUCT_CYCLE');
	const groups = effectiveGroups(catalog, productId).filter((g) => !groupPath.includes(g.id));
	if (!groups.length) return null;
	const autoPopup = groups.some((g) => g.minSelection > 0 || g.included);
	return {
		version: 3,
		autoPopup,
		groups: groups.map((g) => ({
			...g,
			type: g.included ? 'fixed' : 'choice',
			autoPopup: g.included || g.minSelection > 0,
			minQuantity: g.minSelection,
			maxQuantity: g.maxSelection,
			name: g.name,
			label: g.labels,
			eligibleItems: g.options.map((o) => ({
				...o,
				id: o.id,
				surcharge: o.price,
				optionGroups: o.productId ? projectOptionRule(catalog, o.productId, [...path, productId], [...groupPath, g.id])?.groups || [] : [],
			})),
			items: g.included ? g.options.map((o) => ({ itemId: o.id, quantity: o.quantity, surcharge: o.price })) : [],
		})),
	};
}

export async function getOptionCatalog(request: Request, env: Env) {
	if (!unifiedMenuEnabled(env)) return json({ error: 'UNIFIED_MENU_DISABLED' }, 404);
	const catalog = await loadOptionCatalog(env, getTenantId(request));
	return json({ ...catalog, groups: catalog.groups.map((g) => ({ ...g, options: groupOptions(catalog, g) })), complete: true });
}

function normalizeGroup(raw: any, existing?: OptionGroup): OptionGroup {
	if (!raw || !String(raw.name || '').trim() || !Array.isArray(raw.options)) throw new Error('INVALID_GROUP');
	const min = Number(raw.minSelection),
		max = Number(raw.maxSelection);
	if (!integer(min) || !integer(max, 1) || max < min) throw new Error('INVALID_SELECTION_RULES');
	const ids = new Set<string>();
	const options = raw.options
		.filter((o: any) => !o.fromSource)
		.map((o: any): MenuOption => {
			if (!o.id || ids.has(o.id) || !money(o.price) || !integer(o.quantity ?? 1, 1) || (!o.productId && !String(o.name || '').trim()))
				throw new Error('INVALID_OPTION');
			ids.add(o.id);
			if (
				!Array.isArray(o.subOptions || []) ||
				(o.subOptions || []).some((v: SubOption | string) => typeof v === 'string' ? !v.trim()
					: !v || (!v.productId && (typeof v.name !== 'string' || !v.name.trim())) ||
						(v.productId != null && (typeof v.productId !== 'string' || !v.productId)) || !money(v.price ?? 0)) ||
				!Array.isArray(o.eligibilityRules || []) ||
				(o.eligibilityRules || []).some((v: any) => !money(v.min_order_subtotal || 0))
			)
				throw new Error('INVALID_OPTION_DETAILS');
			const subIds = (o.subOptions || []).filter((v: SubOption | string) => typeof v !== 'string' && v.id).map((v: SubOption) => v.id);
			if (new Set(subIds).size !== subIds.length) throw new Error('OPTION_SUB_DUPLICATE');
			const linkedSubIds = (o.subOptions || []).filter((v: SubOption | string) => typeof v !== 'string' && v.productId).map((v: SubOption) => v.productId);
			if (new Set(linkedSubIds).size !== linkedSubIds.length) throw new Error('OPTION_SUB_DUPLICATE');
			// Unknown fields on existing custom options survive updates.
			return {
				...existing?.options.find((old) => old.id === o.id),
				...o,
				name: String(o.name || '').trim(),
				price: Number(o.price),
				productId: o.productId || null,
				quantity: Number(o.quantity || 1),
				isDefault: Boolean(o.isDefault),
				isLocallyOutOfStock: Boolean(o.isLocallyOutOfStock ?? existing?.options.find((old) => old.id === o.id)?.isLocallyOutOfStock),
				outOfStockUntil: o.outOfStockUntil || null,
				subOptions: o.subOptions || [],
				eligibilityRules: o.eligibilityRules || [],
				description: o.description || null,
			};
		});
	const included = Boolean(raw.included);
	const autoPopup = included || min > 0;
	return {
		...existing,
		...raw,
		metadata: existing?.metadata || {},
		name: String(raw.name).trim(),
		scope: raw.scope === 'order' || raw.scope === 'item' ? raw.scope : existing?.scope || 'item',
		minSelection: min,
		maxSelection: max,
		allowRepeats: Boolean(raw.allowRepeats),
		included,
		autoPopup,
		options,
		sources: raw.sources || [],
		labels: raw.labels || {},
		revision: Number(existing?.revision || 0) + 1,
	};
}
async function invalidate(env: Env, tenantId: string) {
	await env.ORDER_STATE.delete(`tenant:${tenantId}:menu`);
	await invalidateBootstrapCache(tenantId, env);
}

export async function saveOptionEntity(request: Request, env: Env, kind: 'product' | 'group'): Promise<Response> {
	if (!unifiedMenuEnabled(env)) return json({ error: 'UNIFIED_MENU_DISABLED' }, 404);
	const tenantId = getTenantId(request);
	try {
		const raw: any = await request.json();
		const catalog = await loadOptionCatalog(env, tenantId);
		const id = String(raw.id || `${tenantId}_${kind}_${crypto.randomUUID()}`);
		const table = kind === 'product' ? 'menu_items' : 'modifier_groups';
		const owner = await env.DB.prepare(`SELECT tenant_id FROM ${table} WHERE id=?`).bind(id).first<{ tenant_id: string }>();
		if (owner && owner.tenant_id !== tenantId) throw new Error('FOREIGN_ENTITY');
		const guardId = crypto.randomUUID();
		const statements: D1PreparedStatement[] = [
			env.DB.prepare(
				'INSERT INTO menu_write_guards (id,valid) VALUES (?, CASE WHEN COALESCE((SELECT revision FROM menu_catalog_revisions WHERE tenant_id=?),0)=? THEN 1 ELSE 0 END)',
			).bind(guardId, tenantId, catalog.revision || 0),
		];
		if (raw.delete || raw.deleted) {
			const entity = kind === 'product' ? catalog.products.find((p) => p.id === id) : catalog.groups.find((g) => g.id === id);
			if (!entity || Number(raw.revision) !== Number(kind === 'product' ? entity.menu_revision : entity.revision))
				return json({ error: 'MENU_CONFLICT' }, 409);
			if (kind === 'product' && catalog.groups.some((g) => groupOptions(catalog, g).some((o) => o.productId === id || o.subOptions.some((sub: SubOption | string) => typeof sub !== 'string' && sub.productId === id))))
				throw new Error('PRODUCT_IS_LINKED');
			const affectedItemIds = kind === 'group' ? new Set<string>(catalog.links.filter((l) => l.groupId === id).map((l) => l.itemId)) : new Set<string>();
			if (kind === 'product') {
				catalog.products = catalog.products.filter((p) => p.id !== id);
				try {
					await deleteTenantImageFromR2AndD1(env, tenantId, {
						name: entity?.image_key || undefined,
						itemId: id,
						itemName: entity?.name,
						categoryId: entity?.category_id,
					});
				} catch {}
			} else {
				catalog.groups = catalog.groups.filter((g) => g.id !== id);
				catalog.categoryLinks = catalog.categoryLinks.filter((l) => l.groupId !== id);
			}
			catalog.links = catalog.links.filter((l) => (kind === 'product' ? l.itemId !== id : l.groupId !== id));
			validateOptionGraph(catalog);
			statements.push(
				env.DB.prepare(`DELETE FROM item_modifier_links WHERE tenant_id=? AND ${kind === 'product' ? 'item_id' : 'group_id'}=?`).bind(
					tenantId,
					id,
				),
			);
			if (kind === 'group') {
				const legacyId = entity.metadata?.source_id || entity.metadata?.source_group_id || id;
				const legacyKey = entity.metadata?.legacy_key || entity.metadata?.source_group_id || id;
				statements.push(env.DB.prepare('DELETE FROM category_modifier_links WHERE tenant_id=? AND group_id=?').bind(tenantId, id));
				statements.push(env.DB.prepare('DELETE FROM modifier_options WHERE tenant_id=? AND group_id=?').bind(tenantId, id));
				// Double-write shadow sync to legacy customizations
				statements.push(
					env.DB.prepare('DELETE FROM menu_customizations WHERE tenant_id=? AND (id IN (?,?) OR key IN (?,?))').bind(
						tenantId,
						id,
						legacyId,
						id,
						legacyKey,
					),
				);
				// Double-write shadow sync to legacy bundle rules for affected items
				for (const itemId of affectedItemIds) {
					const rule = projectOptionRule(catalog, itemId);
					if (rule && rule.groups && rule.groups.length > 0) {
						const ruleId = `rule_${tenantId}_${itemId}`;
						statements.push(
							env.DB.prepare(
								`INSERT INTO menu_bundle_rules (id, tenant_id, parent_item_id, schema_version, config_json, is_active)
								 VALUES (?, ?, ?, 3, ?, 1)
								 ON CONFLICT(tenant_id, parent_item_id) DO UPDATE SET
								   schema_version = 3,
								   config_json = excluded.config_json,
								   is_active = 1`,
							).bind(ruleId, tenantId, itemId, JSON.stringify(rule)),
						);
					} else {
						statements.push(
							env.DB.prepare('DELETE FROM menu_bundle_rules WHERE tenant_id=? AND parent_item_id=?').bind(tenantId, itemId),
						);
					}
				}
			} else {
				// Double-write shadow sync to legacy bundle rules
				statements.push(env.DB.prepare('DELETE FROM menu_bundle_rules WHERE tenant_id=? AND parent_item_id=?').bind(tenantId, id));
			}
			statements.push(env.DB.prepare(`DELETE FROM ${table} WHERE tenant_id=? AND id=?`).bind(tenantId, id));
			statements.push(env.DB.prepare('DELETE FROM menu_write_guards WHERE id=?').bind(guardId));
			await env.DB.batch(statements);
			await invalidate(env, tenantId);
			return json({ success: true, id, catalog: await loadOptionCatalog(env, tenantId) });
		}
		if (kind === 'product') {
			const previous = catalog.products.find((p) => p.id === id);
			if (previous && Number(raw.revision) !== Number(previous.menu_revision)) return json({ error: 'MENU_CONFLICT' }, 409);
			if (
				!String(raw.name || '').trim() ||
				!money(raw.price) ||
				!catalog.categories.some((c) => c.id === raw.categoryId) ||
				!Array.isArray(raw.links)
			)
				throw new Error('INVALID_PRODUCT');
			const links = raw.links.map((l: any) => ({
				itemId: id,
				groupId: String(l.groupId),
				optionIds: Array.isArray(l.optionIds) ? l.optionIds : null,
				disabled: Boolean(l.disabled),
			}));
			if (new Set(links.map((l: any) => l.groupId)).size !== links.length) throw new Error('DUPLICATE_GROUP');
			for (const link of links) {
				const group = catalog.groups.find((g) => g.id === link.groupId && g.scope !== 'order');
				if (
					!group ||
					(link.optionIds !== null &&
						(!Array.isArray(link.optionIds) ||
							new Set(link.optionIds).size !== link.optionIds.length ||
							link.optionIds.some((oid: string) => !groupOptions(catalog, group).some((o) => o.id === oid))))
				)
					throw new Error('INVALID_GROUP_LINK');
			}
			const product = {
				...previous,
				id,
				tenant_id: tenantId,
				category_id: raw.categoryId,
				name: String(raw.name).trim(),
				price: Number(raw.price),
				badge_text: String(raw.badgeText || ''),
				is_recommended: raw.isRecommended ? 1 : 0,
				image_key: typeof raw.imageKey === 'string' ? (raw.imageKey.trim() || null) : (previous?.image_key ?? null),
				menu_revision: Number(previous?.menu_revision || 0) + 1,
			};
			const isImageExplicitlyCleared = raw.imageKey === '' || raw.imageKey === null || raw.removedPhoto === true;
			const hadPreviousImage = Boolean(previous?.image_key);
			if (!product.image_key && (isImageExplicitlyCleared || hadPreviousImage)) {
				try {
					await deleteTenantImageFromR2AndD1(env, tenantId, {
						name: previous?.image_key || undefined,
						itemId: id,
						itemName: product.name || previous?.name,
						categoryId: product.category_id || previous?.category_id,
					});
				} catch {}
				if (env.ORDER_STATE) {
					const keysToDelete = [
						`tenant:${tenantId}:image:${id}`,
						`tenant:${tenantId}:image:product:${id}`,
						`tenant:${tenantId}:image:${product.name}`,
						`tenant:${tenantId}:image:${product.category_id}_${product.name}`,
					];
					if (previous?.image_key) keysToDelete.push(`tenant:${tenantId}:image:${previous.image_key}`);
					if (previous?.name) {
						keysToDelete.push(`tenant:${tenantId}:image:${previous.name}`);
						if (previous?.category_id) keysToDelete.push(`tenant:${tenantId}:image:${previous.category_id}_${previous.name}`);
					}
					await Promise.all(keysToDelete.map((k) => env.ORDER_STATE.delete(k)));
					const listKey = `tenant:${tenantId}:image_list`;
					if (typeof env.ORDER_STATE.get === 'function') {
						const rawList = await env.ORDER_STATE.get(listKey);
						if (rawList) {
							try {
								const list = JSON.parse(rawList);
								const filtered = list.filter((k: string) =>
									k !== id && k !== `product:${id}` && k !== product.name &&
									k !== previous?.image_key && k !== previous?.name &&
									!k.endsWith(`_${product.name}`) && (!previous?.name || !k.endsWith(`_${previous.name}`))
								);
								await env.ORDER_STATE.put(listKey, JSON.stringify(filtered));
							} catch {}
						}
					}
				}
			}
			catalog.products = catalog.products.filter((p) => p.id !== id).concat(product);
			catalog.links = catalog.links.filter((l) => l.itemId !== id).concat(links);
			validateOptionGraph(catalog);
			statements.push(
				env.DB.prepare(
					`INSERT INTO menu_items (id,tenant_id,category_id,name,price,badge_text,is_recommended,menu_revision,sort_order,image_key) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET category_id=excluded.category_id,name=excluded.name,price=excluded.price,badge_text=excluded.badge_text,is_recommended=excluded.is_recommended,menu_revision=excluded.menu_revision,image_key=excluded.image_key,updated_at=datetime('now')`,
				).bind(
					id,
					tenantId,
					product.category_id,
					product.name,
					product.price,
					product.badge_text,
					product.is_recommended,
					product.menu_revision,
					previous?.sort_order ?? catalog.products.length,
					product.image_key,
				),
			);
			statements.push(env.DB.prepare('DELETE FROM item_modifier_links WHERE tenant_id=? AND item_id=?').bind(tenantId, id));
			for (const [i, l] of links.entries())
				statements.push(
					env.DB.prepare(
						'INSERT INTO item_modifier_links (tenant_id,item_id,group_id,option_ids_json,is_disabled,sort_order) VALUES (?,?,?,?,?,?)',
					).bind(tenantId, id, l.groupId, l.optionIds === null ? null : JSON.stringify(l.optionIds), l.disabled ? 1 : 0, i),
				);
			// Double-write shadow sync to menu_bundle_rules
			const bundleRule = projectOptionRule(catalog, id);
			if (bundleRule && bundleRule.groups && bundleRule.groups.length > 0) {
				const ruleId = `rule_${tenantId}_${id}`;
				statements.push(
					env.DB.prepare(
						`INSERT INTO menu_bundle_rules (id, tenant_id, parent_item_id, schema_version, config_json, is_active)
						 VALUES (?, ?, ?, 3, ?, 1)
						 ON CONFLICT(tenant_id, parent_item_id) DO UPDATE SET
						   schema_version = 3,
						   config_json = excluded.config_json,
						   is_active = 1`,
					).bind(ruleId, tenantId, id, JSON.stringify(bundleRule)),
				);
			} else {
				statements.push(
					env.DB.prepare('DELETE FROM menu_bundle_rules WHERE tenant_id=? AND parent_item_id=?').bind(tenantId, id),
				);
			}
		} else {
			const existing = catalog.groups.find((g) => g.id === id);
			if (existing && Number(raw.revision) !== existing.revision) return json({ error: 'MENU_CONFLICT' }, 409);
			const group = normalizeGroup({ ...raw, id }, existing);
			for (const source of group.sources)
				if (
					source.type === 'category'
						? !catalog.categories.some((c) => c.id === (source.refId || source.categoryId))
						: source.type !== 'item_list' ||
							!Array.isArray(source.itemIds) ||
							source.itemIds.some((pid: string) => !catalog.products.some((p) => p.id === pid))
				)
					throw new Error('INVALID_OPTION_SOURCE');
			for (const option of group.options) {
				const owner = await env.DB.prepare('SELECT tenant_id,group_id FROM modifier_options WHERE id=?')
					.bind(option.id)
					.first<{ tenant_id: string; group_id: string }>();
				if (owner && (owner.tenant_id !== tenantId || owner.group_id !== id)) throw new Error('FOREIGN_OPTION');
				if (group.scope === 'order' && option.productId) throw new Error('INVALID_ORDER_OPTION_PRODUCT');
				if (option.productId && !catalog.products.some((p) => p.id === option.productId)) throw new Error('PRODUCT_NOT_FOUND');
				option.subOptions = option.subOptions.map((sub: SubOption | string) => {
					if (typeof sub === 'string' || !sub.productId) return sub;
					if (group.scope === 'order') throw new Error('INVALID_ORDER_OPTION_PRODUCT');
					const product = catalog.products.find((p) => p.id === sub.productId);
					if (!product) throw new Error('PRODUCT_NOT_FOUND');
					// Keep the reference and the independent surcharge; derived stock/retail data stays live.
					return { id: sub.id || `product:${product.id}`, productId: product.id, name: product.name, price: Number(sub.price ?? 0) };
				});
			}
			if (group.scope === 'order') {
				raw.itemIds = [];
			}
			group.sources = raw.sources ?? (group.metadata?.legacyBundleRuleId ? group.sources : []);
			raw.itemIds = raw.itemIds ?? catalog.links.filter((l) => l.groupId === id && !l.disabled).map((l) => l.itemId);
			const itemIds = raw.itemIds;
			if (!Array.isArray(itemIds) || itemIds.some((pid: string) => !catalog.products.some((p) => p.id === pid)))
				throw new Error('INVALID_LINKED_PRODUCTS');
			if (Array.isArray(raw.categoryIds) && raw.categoryIds.some((cid: string) => !catalog.categories.some((c) => c.id === cid)))
				throw new Error('INVALID_LINKED_CATEGORIES');
			const groupOptionsList = groupOptions(catalog, group);
			if (itemIds.some((itemId: string) => groupOptionsList.some((o) => o.productId === itemId))) {
				throw new Error('OPTION_PRODUCT_CYCLE');
			}
			const categoryIds: string[] = [];
			catalog.categoryLinks = catalog.categoryLinks.filter((l) => l.groupId !== id);
			const oldLinks = catalog.links.filter((l) => l.groupId === id);
			const newLinks = oldLinks
				.filter((l) => l.disabled && !itemIds.includes(l.itemId))
				.concat(
					[...new Set<string>(itemIds)].map(
						(itemId) =>
							oldLinks.find((l) => l.itemId === itemId && !l.disabled) || { itemId, groupId: id, optionIds: null, disabled: false },
					),
				);
			if (group.included) group.minSelection = group.maxSelection = groupOptions(catalog, group).reduce((sum, o) => sum + o.quantity, 0);
			if (group.included && !group.maxSelection) throw new Error(`INSUFFICIENT_OPTIONS:${group.id}`);
			const totalOptions = groupOptions(catalog, group).length;
			if (!group.included) {
				if (totalOptions === 0) throw new Error(`INSUFFICIENT_OPTIONS:${group.id}`);
				if (!group.allowRepeats && totalOptions > 0 && group.maxSelection > totalOptions && group.maxSelection >= 99) {
					group.maxSelection = totalOptions;
				}
				if (!group.allowRepeats && group.minSelection > totalOptions) throw new Error(`INSUFFICIENT_OPTIONS:${group.id}`);
				if (!group.allowRepeats && group.maxSelection > totalOptions) throw new Error(`INSUFFICIENT_OPTIONS:${group.id}`);
			}
			for (const link of newLinks)
				if (Array.isArray(link.optionIds))
					link.optionIds = link.optionIds.filter((oid: string) => groupOptions(catalog, group).some((o) => o.id === oid));
			catalog.groups = catalog.groups.filter((g) => g.id !== id).concat(group);
			catalog.links = catalog.links.filter((l) => l.groupId !== id).concat(newLinks);
			validateOptionGraph(catalog);
			statements.push(
				env.DB.prepare(
					`INSERT INTO modifier_groups (id,tenant_id,name,selection_type,is_required,min_selection,max_selection,allow_repeats,included,sources_json,labels_json,revision,scope,auto_popup) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,selection_type=excluded.selection_type,is_required=excluded.is_required,min_selection=excluded.min_selection,max_selection=excluded.max_selection,allow_repeats=excluded.allow_repeats,included=excluded.included,sources_json=excluded.sources_json,labels_json=excluded.labels_json,revision=excluded.revision,scope=excluded.scope,auto_popup=excluded.auto_popup,updated_at=datetime('now')`,
				).bind(
					id,
					tenantId,
					group.name,
					group.maxSelection === 1 ? 'single' : 'multiple',
					group.minSelection > 0 ? 1 : 0,
					group.minSelection,
					group.maxSelection,
					group.allowRepeats ? 1 : 0,
					group.included ? 1 : 0,
					JSON.stringify(group.sources),
					JSON.stringify(group.labels),
					group.revision,
					group.scope,
					group.autoPopup ? 1 : 0,
				),
			);
			statements.push(env.DB.prepare('DELETE FROM modifier_options WHERE tenant_id=? AND group_id=?').bind(tenantId, id));
			for (const [i, o] of group.options.entries())
				statements.push(
					env.DB.prepare(
						`INSERT INTO modifier_options (id,tenant_id,group_id,name,price,product_id,included_quantity,is_default,sort_order,out_of_stock_until,sub_options_json,eligibility_rules_json,description,is_out_of_stock,source_metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
					).bind(
						o.id,
						tenantId,
						id,
						o.name,
						o.price,
						o.productId,
						o.quantity,
						o.isDefault ? 1 : 0,
						i,
						o.outOfStockUntil,
						JSON.stringify(o.subOptions),
						JSON.stringify(o.eligibilityRules),
						o.description,
						o.isLocallyOutOfStock ? 1 : 0,
						JSON.stringify(o.metadata || {}),
					),
				);
			statements.push(env.DB.prepare('DELETE FROM item_modifier_links WHERE tenant_id=? AND group_id=?').bind(tenantId, id));
			statements.push(env.DB.prepare('DELETE FROM category_modifier_links WHERE tenant_id=? AND group_id=?').bind(tenantId, id));
			for (const categoryId of new Set<string>(categoryIds))
				statements.push(
					env.DB.prepare('INSERT INTO category_modifier_links (tenant_id,category_id,group_id) VALUES (?,?,?)').bind(
						tenantId,
						categoryId,
						id,
					),
				);
			for (const l of newLinks)
				statements.push(
					env.DB.prepare(
						'INSERT INTO item_modifier_links (tenant_id,item_id,group_id,option_ids_json,is_disabled) VALUES (?,?,?,?,?)',
					).bind(tenantId, l.itemId, id, l.optionIds === null ? null : JSON.stringify(l.optionIds), l.disabled ? 1 : 0),
				);
			// Double-write shadow sync:
			const legacyCustomId = group.metadata?.source_id || group.metadata?.source_group_id || id;
			const legacyCustomKey = group.metadata?.legacy_key || group.metadata?.source_group_id || id;
			if (group.scope === 'order') {
				const legacyOptionsJson = JSON.stringify(
					group.options.map((o) => ({
						id: o.id,
						name: o.name,
						price: o.price,
						surcharge: o.price,
						isDefault: o.isDefault,
						isOutOfStock: o.isLocallyOutOfStock,
						is_out_of_stock: o.isLocallyOutOfStock,
						outOfStockUntil: o.outOfStockUntil,
						subOptions: o.subOptions,
						sub_options: o.subOptions,
						eligibilityRules: o.eligibilityRules,
						minOrderSubtotal: o.eligibilityRules?.find((r: any) => r.rule_type === 'min_order_subtotal')?.min_order_subtotal,
					})),
				);
				statements.push(
					env.DB.prepare(
						`INSERT INTO menu_customizations (id, tenant_id, key, title, type, sort_order, options_json)
						 VALUES (?, ?, ?, ?, ?, ?, ?)
						 ON CONFLICT(id) DO UPDATE SET
						   title = excluded.title,
						   type = excluded.type,
						   sort_order = excluded.sort_order,
						   options_json = excluded.options_json`,
					).bind(
						legacyCustomId,
						tenantId,
						legacyCustomKey,
						group.name,
						group.maxSelection === 1 ? 'radio' : 'checkbox',
						Number(group.sortOrder || 0),
						legacyOptionsJson,
					),
				);
				// If group changed from item scope to order scope, update old linked items
				for (const itemId of new Set<string>(oldLinks.map((l) => l.itemId))) {
					const rule = projectOptionRule(catalog, itemId);
					if (rule && rule.groups && rule.groups.length > 0) {
						const ruleId = `rule_${tenantId}_${itemId}`;
						statements.push(
							env.DB.prepare(
								`INSERT INTO menu_bundle_rules (id, tenant_id, parent_item_id, schema_version, config_json, is_active)
								 VALUES (?, ?, ?, 3, ?, 1)
								 ON CONFLICT(tenant_id, parent_item_id) DO UPDATE SET
								   schema_version = 3,
								   config_json = excluded.config_json,
								   is_active = 1`,
							).bind(ruleId, tenantId, itemId, JSON.stringify(rule)),
						);
					} else {
						statements.push(
							env.DB.prepare('DELETE FROM menu_bundle_rules WHERE tenant_id=? AND parent_item_id=?').bind(tenantId, itemId),
						);
					}
				}
			} else {
				// If group changed from order scope to item scope, remove from menu_customizations
				if (existing?.scope === 'order') {
					statements.push(
						env.DB.prepare('DELETE FROM menu_customizations WHERE tenant_id=? AND (id IN (?,?) OR key IN (?,?))').bind(
							tenantId,
							id,
							legacyCustomId,
							id,
							legacyCustomKey,
						),
					);
				}
				// For item-scope group, sync menu_bundle_rules for any linked items
				const affectedItemIds = new Set<string>([...raw.itemIds, ...oldLinks.map((l) => l.itemId)]);
				for (const itemId of affectedItemIds) {
					const rule = projectOptionRule(catalog, itemId);
					if (rule && rule.groups && rule.groups.length > 0) {
						const ruleId = `rule_${tenantId}_${itemId}`;
						statements.push(
							env.DB.prepare(
								`INSERT INTO menu_bundle_rules (id, tenant_id, parent_item_id, schema_version, config_json, is_active)
								 VALUES (?, ?, ?, 3, ?, 1)
								 ON CONFLICT(tenant_id, parent_item_id) DO UPDATE SET
								   schema_version = 3,
								   config_json = excluded.config_json,
								   is_active = 1`,
							).bind(ruleId, tenantId, itemId, JSON.stringify(rule)),
						);
					} else {
						statements.push(
							env.DB.prepare('DELETE FROM menu_bundle_rules WHERE tenant_id=? AND parent_item_id=?').bind(tenantId, itemId),
						);
					}
				}
			}
		}
		statements.push(env.DB.prepare('DELETE FROM menu_write_guards WHERE id=?').bind(guardId));
		await env.DB.batch(statements);
		await invalidate(env, tenantId);
		return json({ success: true, id, catalog: await loadOptionCatalog(env, tenantId) });
	} catch (error) {
		const code = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'MENU_SAVE_FAILED';
		console.error('Option entity save failed', { tenantId, kind, code });
		return json({ error: code.includes('CHECK constraint') ? 'MENU_CONFLICT' : code }, code.includes('CHECK constraint') ? 409 : 400);
	}
}

/** Validate and rebuild snapshots at the trust boundary; never trust submitted names or prices. */
export function validateOptionSelection(
	catalog: OptionCatalog,
	productId: string,
	selections: any[],
	path: string[] = [],
	merchandiseSubtotal = Infinity,
): { groups: any[]; extra: number } {
	if (path.includes(productId) || path.length > 12) throw new Error('OPTION_PRODUCT_CYCLE');
	const product = catalog.products.find((p) => p.id === productId);
	if (!product || oos(product)) throw new Error('PRODUCT_UNAVAILABLE');
	const groups = effectiveGroups(catalog, productId);
	if (!Array.isArray(selections) || selections.length !== groups.length || new Set(selections.map((s) => s.groupId)).size !== groups.length)
		throw new Error('OPTION_GROUPS_REQUIRED');
	let extra = 0;
	const snapshots = groups.map((group) => {
		const selected = selections.find((s) => s.groupId === group.id || s.groupId === group.metadata?.legacyGroupId);
		if (!selected || !Array.isArray(selected.items)) throw new Error('OPTION_GROUPS_REQUIRED');
		const count = selected.items.reduce((sum: number, s: any) => sum + Number(s.quantity), 0);
		const fixedCount = group.options.reduce((sum, o) => sum + o.quantity, 0);
		if (
			!integer(count) ||
			count < (group.included ? fixedCount : group.minSelection) ||
			count > (group.included ? fixedCount : group.maxSelection)
		)
			throw new Error('OPTION_QUANTITY');
		const seen = new Map<string, number>();
		const items = selected.items.map((s: any) => {
			const option = group.options.find((o) => o.id === (s.optionId || s.itemId) || (o.productId && o.productId === s.itemId));
			if (!option || option.isOutOfStock || !integer(s.quantity, 1)) throw new Error('OPTION_UNAVAILABLE');
			if (option.eligibilityRules.some((r) => Number(r.min_order_subtotal || 0) > merchandiseSubtotal))
				throw new Error('MIN_ORDER_SUBTOTAL_NOT_MET');
			const qty = Number(s.quantity);
			const total = (seen.get(option.id) || 0) + qty;
			seen.set(option.id, total);
			if ((!group.allowRepeats && !group.included && total > 1) || (group.included && total > option.quantity))
				throw new Error('OPTION_REPEAT');
			const child = option.productId
				? validateOptionSelection(catalog, option.productId, s.groups || [], [...path, productId], merchandiseSubtotal)
				: { groups: [], extra: 0 };
			const allowedSub = option.subOptions || [];
			const subs = Array.isArray(s.subOptions) ? s.subOptions : [];
			if (new Set(subs.map(subKey)).size !== subs.length) throw new Error('OPTION_SUB_DUPLICATE');
			const resolvedSubs = subs.map((v: any) => {
				const sub = allowedSub.find((o: SubOption | string) => subKey(o) === subKey(v));
				if (!sub || sub.isOutOfStock || sub.isOos) throw new Error('OPTION_SUB_INVALID');
				return {
					...(sub.id ? { id: sub.id } : {}),
					...(sub.productId ? { productId: sub.productId, itemId: sub.productId } : {}),
					name: typeof sub === 'string' ? sub : sub.name, price: Number(sub.price || 0),
				};
			});
			const subExtra = resolvedSubs.reduce((sum: number, s: any) => sum + s.price, 0);
			extra += (option.price + child.extra + subExtra) * qty;
			// Flatten child labels into existing receipt modifiers while retaining the structured tree.
			const modifiers = child.groups
				.flatMap((g) =>
					g.items.map((i: any) => ({
						groupId: g.groupId,
						name: `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}${i.modifiers?.length ? ` (${i.modifiers.map((m: any) => m.name).join('、')})` : ''}`,
						price:
							(Number(i.surcharge || 0) + (i.modifiers || []).reduce((sum: number, m: any) => sum + Number(m.price || 0), 0)) * i.quantity,
					})),
				)
				.concat(resolvedSubs);
			return {
				itemId: option.productId || option.id,
				optionId: option.id,
				name: option.name,
				quantity: qty,
				price: 0,
				surcharge: option.price,
				modifiers,
				groups: child.groups,
				subOptions: resolvedSubs,
			};
		});
		if (group.included && group.options.some((o) => seen.get(o.id) !== o.quantity)) throw new Error('OPTION_INCLUDED_REQUIRED');
		return { groupId: group.id, groupName: group.name, items };
	});
	return { groups: snapshots, extra };
}
export type UnifiedValidationResult = {
	valid: boolean;
	legacy?: any[];
	code?: string;
	error?: string;
	itemIndex?: number;
	expectedSubtotal?: number;
	items?: any[];
};

export async function validateUnifiedOrderItems(
	env: Env,
	tenantId: string,
	items: any[],
	features?: string[]
): Promise<UnifiedValidationResult> {
	if (!Array.isArray(items) || items.length === 0) {
		return { valid: true, legacy: [] };
	}
	const catalog = await loadOptionCatalog(env, tenantId);
	if (pricingRustEnabled(env, tenantId, features)) {
		try {
			return await callRustValidateUnifiedItems(env, catalog, items);
		} catch (err) {
			console.warn('[PricingEngine] Rust validate-unified error, falling back to TypeScript:', err);
		}
	}
	const legacy: any[] = [];
	const computedSubtotals = new Map<number, { id: string; portions: any[]; subtotal: number }>();
	let merchandiseSubtotal = 0;

	// Pass 1: Validate structure, stock, prices and compute server-authoritative subtotal per item
	for (const [itemIndex, item] of items.entries()) {
		const id = item.itemId || item.item_id;
		const product = catalog.products.find((p) => p.id === id);
		if (!product || !effectiveGroups(catalog, id).length) {
			legacy.push(item);
			if (product && integer(item.quantity, 1)) {
				merchandiseSubtotal += Number(product.price || 0) * Number(item.quantity);
			}
			continue;
		}
		try {
			if (!integer(item.quantity, 1)) throw new Error('OPTION_QUANTITY');
			const raw = parse(item.bundleSelections || item.bundle_snapshot_json, null);
			if (!Array.isArray(raw?.portions) || raw.portions.length !== Number(item.quantity)) throw new Error('OPTION_SELECTION_REQUIRED');
			let extra = 0;
			const portions = raw.portions.map((p: any, i: number) => {
				const result = validateOptionSelection(catalog, id, p.groups, [], Infinity);
				extra += result.extra;
				return { portionIndex: i, groups: result.groups, rawGroups: p.groups };
			});
			const subtotal = Math.round((Number(product.price) * Number(item.quantity) + extra) * 100) / 100;
			if (Math.abs(Number(item.subtotal) - subtotal) > 0.001 || !Number.isFinite(Number(item.subtotal)))
				return { valid: false, code: 'OPTION_PRICE_CHANGED', error: '餐點價格已更新，請重新確認', itemIndex, expectedSubtotal: subtotal };
			computedSubtotals.set(itemIndex, { id, portions, subtotal });
			merchandiseSubtotal += subtotal;
		} catch (error) {
			return {
				valid: false,
				code: error instanceof Error ? error.message : 'OPTION_INVALID',
				error: '餐點選項已更新，請重新確認',
				itemIndex,
			};
		}
	}

	// Subtract category bundle discounts if any
	for (const cat of catalog.categories) {
		const rule = parse(cat.pricing_rules, null);
		if (!rule?.bundle_qty || !rule?.bundle_price) continue;
		const prices = items
			.filter((item) => {
				const p = catalog.products.find((prod) => prod.id === (item.itemId || item.item_id));
				return p && p.category_id === cat.id && integer(item.quantity, 1);
			})
			.flatMap((item) => {
				const p = catalog.products.find((prod) => prod.id === (item.itemId || item.item_id))!;
				return Array(Number(item.quantity)).fill(Number(p.price || 0));
			})
			.sort((a, b) => b - a);
		const count = Math.floor(prices.length / rule.bundle_qty);
		if (count) {
			merchandiseSubtotal -= Math.max(0, prices.slice(0, count * rule.bundle_qty).reduce((a, b) => a + b, 0) - count * rule.bundle_price);
		}
	}
	merchandiseSubtotal = Math.max(0, Math.round(merchandiseSubtotal * 100) / 100);

	// Pass 2: Enforce min_order_subtotal eligibility rules against server-authoritative merchandiseSubtotal
	for (const [itemIndex, computed] of computedSubtotals.entries()) {
		try {
			const cleanPortions = computed.portions.map((p: any, i: number) => {
				const result = validateOptionSelection(catalog, computed.id, p.rawGroups, [], merchandiseSubtotal);
				return { portionIndex: i, groups: result.groups };
			});
			const item = items[itemIndex];
			item.bundleSelections = { version: 3, portions: cleanPortions };
			item.bundle_snapshot_json = JSON.stringify(item.bundleSelections);
			item.subtotal = computed.subtotal;
		} catch (error) {
			return {
				valid: false,
				code: error instanceof Error ? error.message : 'OPTION_INVALID',
				error: '餐點選項已更新，請重新確認',
				itemIndex,
			};
		}
	}
	return { valid: true, legacy };
}
