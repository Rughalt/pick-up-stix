import { getCurrencyTypes, getPriceDataPath, getQuantityDataPath, _onChangeInputDelta } from '../../utils';
import ContainerImageSelectionApplication from "./container-image-selection-application.js";
import {
	createOwnedItem,
	currencyCollected,
	getLootTokenData,
	getValidControlledTokens,
	itemCollected,
	lootTokens,
	normalizeDropData,
	saveLootTokenData,
	updateActor,
	updateEntity
} from './main';
import { ItemType, ContainerLoot, PickUpStixFlags, DropData } from "./models";
import { SettingKeys } from './settings';
import { ContainerSoundConfig } from './container-sound-config-application';

/**
 * Application class to display to select an item that the token is
 * associated with
 */
export default class ItemConfigApplication extends BaseEntitySheet {
	private _html: any;
	private _currencyEnabled: boolean;
  private _selectedTokenId: string;

	static get defaultOptions(): ApplicationOptions {
		return mergeObject(super.defaultOptions, {
			closeOnSubmit: false,
			submitOnClose: false,
			submitOnChange: true,
			id: "pick-up-stix-item-config",
			template: "modules/pick-up-stix/module/pick-up-stix/templates/item-config.html",
			width: 850,
			title: `${game.user.isGM ? 'Configure Loot Container' : 'Loot Container'}`,
			resizable: true,
			classes: ['pick-up-stix', 'item-config-sheet'],
			dragDrop: [{ dropSelector: null }]
		});
	}

	constructor(object: any, ...args) {
		super(object, args);

		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | constructor called with:`);
		console.log([object]);

		this._currencyEnabled = !game.settings.get('pick-up-stix', SettingKeys.disableCurrencyLoot);
	}

	activateListeners(html) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | activateListeners`);
		console.log([html]);
		this._html = html;
		super.activateListeners(this._html);

		Hooks.off('preDeleteItem', this.preDeleteItemHook);
		// Hooks.off('updateItem', this.updateItemHook);
		Hooks.off('updateToken', this.updateTokenHook);
		Hooks.off('controlToken', this.controlTokenHook);
		Hooks.off('pick-up-stix.lootTokenDataSaved', this.lootTokenDataSavedHook);
		// Hooks.on('updateItem', this.updateItemHook);
		Hooks.on('preDeleteItem', this.preDeleteItemHook);
		Hooks.on('updateToken', this.updateTokenHook);
    Hooks.on('controlToken', this.controlTokenHook);
    Hooks.on('pick-up-stix.lootTokenDataSaved', this.lootTokenDataSavedHook);

		$(html)
			.find('input')
			.on('focus', e => e.currentTarget.select())
			.addBack()
			.find('[data-dtype="Number"]')
			.on('change', _onChangeInputDelta.bind(this.object));

		// set click listeners on the buttons to pick up individual items
		$(html).find(`a.item-take`).on('click', e => this._onTakeItem);

		// set click listeners on the buttons to delete items
		$(html).find(`a.item-delete`).on('click', e => this._onDeleteItem);

		if (game.user.isGM) {
			$(html)
				.find('.configure-sound')
				.on('click', this._onConfigureSound)
				.css('cursor', 'pointer');

			$(html)
				.find(`[data-edit="img"]`)
				.on('click', this._onEditImage)
				.css('cursor', 'pointer');
		}

		$(html)
			.find('[data-actor_select]')
			.on('click', e => this._onSelectActor);

		if (this._currencyEnabled) {
			// set click listener for taking currency
			$(html).find(`a.currency-take`).on('click', this._onTakeCurrency);
		}

		$(html).find(`input[type="text"]`).prop('readonly', !game.user.isGM);
		$(html).find(`input[type="text"]`).prop('disabled', 	!game.user.isGM);

		$(html).find('input#canCloseCheckbox').prop('checked', this.object.getFlag('pick-up-stix', 'pick-up-stix.container.canClose') ?? true);

		if (this.object) {
			$(html).find('input#scale').val(this.object?.data?.width ?? 1);
		}

		if (!game.user.isGM) {
			$(html).find(`input[type="text"]`).addClass('isNotGM');
		}
	}

	getData(options?: any): any {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | getData:`);
		const actionTokens = options.renderData?.tokens ?? [];
		const quantityDataPath = getQuantityDataPath();
		const priceDataPath = getPriceDataPath();

		const flags = this.object.getFlag('pick-up-stix', 'pick-up-stix');
		const sceneId = flags.sceneId;
		const tokenId = flags.tokenId;

		const token = canvas.tokens.placeables.find(t => t.id === tokenId);
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | getData | application is for ${token ? 'a Token' : 'an Item'}`);

		let containerData;
		if (token) {
			const allTokenData = getLootTokenData();
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | getData | allTokenData`);
			console.log([allTokenData]);
			containerData = allTokenData?.[sceneId]?.[tokenId].container;
		}
		else {
			containerData = duplicate(this.object.getFlag('pick-up-stix', `pick-up-stix.container`) ?? {});
		}

		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | getData | containerData`);
		console.log([containerData]);

		const loot = Object.entries(containerData?.loot as ContainerLoot ?? {}).reduce((prev, [lootKey, lootItems]) => {
			const items = lootItems?.map(i => {
				if (!i.data.hasOwnProperty('quantity')) {
					setProperty(i.data, quantityDataPath, 0);
				}

				return {
					...i,
					price: +getProperty(i.data, quantityDataPath) * +parseFloat(getProperty(i.data, priceDataPath) ?? 0),
					qty: +getProperty(i.data, quantityDataPath)
				}
			});

			if (items?.length > 0) {
				prev[lootKey] = items;
			}

			return prev;
		}, {});

		let description = this.object.getFlag('pick-up-stix', 'pick-up-stix.container.description') ?? '';
		description = description.replace(/font-size:\s*\d*.*;/, 'font-size: 16px;');

		const currencyTypes = getCurrencyTypes();
		const tokens = getValidControlledTokens(token)
			.concat(actionTokens)
			.reduce((acc, next) => {
				if (!next || acc.map(t => t.id).includes(next.id)) {
					return acc;
				}
				acc.push(next);
				return acc;
			}, [])
			.map(t => ({ token: t, class: this._selectedTokenId === t.id ? 'active' : '' }))
			.filter(t => !!t.token)
			.sort((a, b) => {
				if (a.token.name < b.token.name) return -1;
				if (a.token.name > b.token.name) return 1;
				return 0;
			});

		if (!this._selectedTokenId && tokens.length) {
			this._selectedTokenId = tokens[0].token.id;
			tokens[0].class = 'active';
		}

		const data = {
			currencyEnabled: this._currencyEnabled,
			currencyTypes: Object.entries(currencyTypes).map(([k, v]) => ({ short: k, long: v })),
			currency: containerData.currency,
			lootTypes: Object.keys(loot),
			loot,
			profileImage: containerData.imageOpenPath,
			description,
			object: this.object.data,
			user: game.user,
			quantityDataPath,
			hasToken: !!token,
			tokens
		};

		console.log(data);
		return data;
	}

	/**
	 * @override
	 * @param e
	 */
	protected async _onDrop(e) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop`);
		const dropData: DropData = normalizeDropData(JSON.parse(e.dataTransfer.getData('text/plain')) ?? {});
    console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop | dropped data`);
    console.log([dropData]);

		if (dropData.type !== "Item") {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop | item is not 'Item' type`);
			return;
		}

		let droppedItemData;

		if (!dropData.actor && dropData.actorId) {
			ui.notifications.error(`No valid actor found for actor '${dropData.actorId}', please ensure you are controlling the token (and only the one token) for the character you're working with`);
			return;
		}

		// if the dropped item comes from an actor, we need to delete the item from that actor
		if (dropData.actor) {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop | drop data contains actor ID '${dropData.actorId}', delete item from actor`);
			droppedItemData = duplicate(dropData.data);
			await dropData.actor.deleteOwnedItem(droppedItemData._id);
		}
		else {
			droppedItemData = await game.items.get(dropData.id)?.data ?? await game.packs.get(dropData.pack).getEntry(dropData.id);
		}

		const itemType = droppedItemData.type;
		const lootTokenFlags: PickUpStixFlags = duplicate(this.object.getFlag('pick-up-stix', 'pick-up-stix') ?? {});
		const { sceneId, tokenId } = lootTokenFlags;
		const isToken = sceneId !== undefined && tokenId !== undefined;
		const lootTokenData = isToken
			? getLootTokenData()?.[sceneId]?.[tokenId]
			: lootTokenFlags;

    const containerData = lootTokenData?.container;

		const loot: ContainerLoot = containerData?.loot ?? {};
		if (!loot[itemType]) {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop | no items of type '${itemType}', creating new slot`);
			loot[itemType] = [];
		}
		const qtyDataPath = getQuantityDataPath();
		const existingItem = loot[itemType]?.find(i => i._id === (dropData.actor ? getProperty(droppedItemData, 'flags.pick-up-stix.pick-up-stix.originalItemId') : droppedItemData._id));
		if (existingItem) {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop | existing data for type '${itemType}', increase quantity by 1`);
			setProperty(existingItem.data, qtyDataPath, +getProperty(existingItem.data, qtyDataPath) + 1)
		}
		else {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop | existing data for item '${droppedItemData._id}' does not exist, set quantity to 1 and add to slot`);
			setProperty(droppedItemData.data, qtyDataPath, 1);
			loot[itemType].push({
				...droppedItemData
			});
		}

		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | _onDrop | submit data:`);
		console.log(lootTokenFlags);

		if (isToken) {
			await saveLootTokenData(sceneId, tokenId, lootTokenData);
		}
		else {
			await this.submit({ updateData: { container: { ...containerData, loot }}});
		}
	}

	/**
	 * @override
	 * @param e
	 * @param formData
	 */
	protected async _updateObject(e, formData) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | _updateObject called with args:`);
		console.log([e, duplicate(formData)]);

		const { sceneId, tokenId } = this.object.getFlag('pick-up-stix', 'pick-up-stix');
		const isToken = sceneId !== undefined && tokenId !== undefined;
		const containerData = isToken
			? getLootTokenData()?.[sceneId]?.[tokenId]?.container
			: duplicate(this.object.getFlag('pick-up-stix', `pick-up-stix.container`) ?? {});

		formData.img = containerData.isOpen
			? containerData?.imageOpenPath
			: containerData?.imageClosePath;

		const tokenLoot: ContainerLoot = containerData?.loot;

		if (e.type === 'change') {
			Object.entries(tokenLoot ?? {}).forEach(([lootType, v]) => {
				if (v.length === 0) {
					return;
				}

				setProperty(formData, `container.loot.${lootType}`, v.map(itemData => {
					setProperty(
						itemData.data,
						getQuantityDataPath(),
						$(e.currentTarget).hasClass('quantity-input') && e.currentTarget.dataset.lootType === itemData.type && e.currentTarget.dataset.lootId === itemData._id ?
							+$(e.currentTarget).val() :
							+getProperty(itemData.data, getQuantityDataPath())
					);
					return itemData;
				}));
			});
		}

		if (this._currencyEnabled) {
			// when the user is a GM the currency is taken from the inputs on the form, but when the user NOT a GM, there are no inputs
			if (!game.user.isGM) {
				if (tokenLoot.currency) {
					setProperty(formData, `container.loot.currency`, { ...tokenLoot.currency });
				}
			}
		}

		if (formData.width !== undefined) {
			// we only collect the one size and store it as the width, so here we also store the height to be the same
			formData.height = formData.width;
		}

		const expandedObject = expandObject(flattenObject(formData));
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | _updateObject | expanded 'formData' object:`);
		console.log(expandedObject);

		if (!isToken) {
			await updateEntity(this.object, {
				'flags': {
					'pick-up-stix': {
						'pick-up-stix': expandedObject
					}
				}
			});
		}
		else {
			await saveLootTokenData(sceneId, tokenId, expandedObject);
		}

		// this.render();
	}

	/**
	 * @override
	 */
	close = async () => {
    console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | close`);
		Hooks.off('preDeleteItem', this.preDeleteItemHook);
		// Hooks.off('updateItem', this.updateItemHook);
		Hooks.off('updateToken', this.updateTokenHook);
    Hooks.off('controlToken', this.controlTokenHook);
    Hooks.off('pick-up-stix.lootTokenDataSaved', this.lootTokenDataSavedHook);
		return super.close();
	}

	/**
	 * @override
	 * @param token
	 * @param controlled
	 */
	private controlTokenHook = (token, controlled): void => {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | controlTokenHook`);
		setTimeout(this.render.bind(this), 100);
  }

  private lootTokenDataSavedHook = (sceneId, tokenId, data): void => {
		const token = canvas.tokens.placeables.find(p => p.id === tokenId);

		if (token.scene.id !== sceneId || token.id !== tokenId) {
			return;
		}

    console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | lootTokenDataSavedHook`);
    console.log([sceneId, tokenId, data]);

    this.render();
  }

	private updateTokenHook = (scene, token, diff, options): void => {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | updateTokenHook`);

		// clear the selected token because the token might have moved too far away to be
		// eligible
		this._selectedTokenId = null;
		setTimeout(this.render.bind(this), 100);
	}

	protected preDeleteItemHook = (item): boolean => {
		/* console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | preDeleteItemHook:`);
		console.log([item]);

		if (item.id === this.object.id) {
			ui.notifications.error('This Item is currently being edited. Close the config window to delete the item.');
		}
		return item.id !== this.object.id; */
		return true;
	}

	protected updateItemHook = (item, data, options): void => {
		/* if (this.object.id !== item.id) {
			return;
		}

		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | updateItemHook | called with args:`);
		console.log([item, data, options]);
		this.render(); */
	}

	private _onSelectActor = (e): void => {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | onActorSelect`);
		this._selectedTokenId = e.currentTarget.dataset.token_id;
		this.render();
	}

	private _onConfigureSound = (e): void => {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | onConfigureSound`);
		new ContainerSoundConfig(this.object, {}).render(true);
	}

	protected async _onDeleteItem(e) {
		console.log(`pick-up-stix | ItemConfigApplication | _onDeleteItem`);
		const itemId = e.currentTarget.dataset.id;

		const loot: ContainerLoot = duplicate(this.object.getFlag('pick-up-stix', 'pick-up-stix.container.loot'));

		Object.values(loot).forEach(lootItems => {
			lootItems.findSplice(l => l._id === itemId);
		});

		this.submit({
			updateData: {
				flags: {
					'pick-up-stix': {
						'pick-up-stix': {
							container: {
								loot
							}
						}
					}
				}
			}
		});
	}

	protected async _onTakeCurrency(e) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | _onTakeCurrency`);

		if (!this._selectedTokenId) {
			ui.notifications.error(`You must be controlling at least one token that is within reach of the loot.`);
			return;
		}

		const token = canvas.tokens.placeables.find(t => t.id === this._selectedTokenId);

		// TODO: this code will need to be updated to support different system's currencies
		const actorCurrency = { ...getProperty(token.actor, 'data.data.currency') ?? {} };

		const currency = duplicate(this.object.getFlag('pick-up-stix', 'pick-up-stix.container.currency') ?? {});
		if (!Object.values(currency).some(c => c > 0)) {
			console.log(`pick-up-stix | ItemCOnfigApplication ${this.appId} | _onTakeCurrency | No currency to loot`);
			return;
		}

		Object.keys(actorCurrency).forEach(k => actorCurrency[k] = +actorCurrency[k] + +currency[k]);
		await updateActor(token.actor, {'data.currency': actorCurrency});

		currencyCollected(token, Object.entries(currency).filter(([, v]) => v > 0).reduce((prev, [k, v]) => { prev[k] = v; return prev; }, {}));

		Object.keys(currency)?.forEach(k => currency[k] = 0);
		$(this._html).find('.data-currency-input').val(0);
		await this.submit({
			updateData: {
				flags: {
					'pick-up-stix': {
						'pick-up-stix': {
							container: {
								currency
							}
						}
					}
				}
			}
		});
	}

	protected async _onTakeItem(e) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | _onTakeItem`);

		if (!this._selectedTokenId) {
			ui.notifications.error(`You must be controlling at least one token that is within reach of the loot.`);
			return;
		}

		const loot: ContainerLoot = duplicate(this.object.getFlag('pick-up-stix', 'pick-up-stix.container.loot') ?? {});
		const itemType = $(e.currentTarget).parents(`ol[data-itemType]`).attr('data-itemType');
		const itemId = e.currentTarget.dataset.id;
		const itemData = loot?.[itemType]?.find(i => i._id === itemId);
		const oldQty = getProperty(itemData.data, getQuantityDataPath());

		if (oldQty - 1 <= 0) {
			loot?.[itemType]?.findSplice(v => v._id === itemId);
		}
		else {
			setProperty(itemData.data, getQuantityDataPath(), oldQty - 1);
		}

		const token = canvas.tokens.placeables.find(t => t.id === this._selectedTokenId);

		await createOwnedItem(token.actor, [{
			...duplicate(itemData),
			data: {
				...duplicate(itemData.data),
				[getQuantityDataPath()]: 1
			}
		}]);

		itemCollected(token, itemData);

		await this.submit({
			updateData: {
				flags: {
					'pick-up-stix': {
						'pick-up-stix': {
							container: {
								loot
							}
						}
					}
				}
			}
		});
	}

	protected _onEditImage = (e): void => {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onEditImage`);

		new ContainerImageSelectionApplication(this.object).render(true);
		Hooks.once('closeContainerImageSelectionApplication', () => {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | closeContainerImageSelectionApplication hook`);
			const img =
				this.object.getFlag('pick-up-stix', 'pick-up-stix.container.isOpen') ?
				this.object.getFlag('pick-up-stix', 'pick-up-stix.container.imageOpenPath') :
				this.object.getFlag('pick-up-stix', 'pick-up-stix.container.imageClosePath');
			this.object.update({ img });
		});
	}
}
