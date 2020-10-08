import { getCurrencyTypes, getPriceDataPath, getQuantityDataPath, _onChangeInputDelta } from '../../utils';
import ContainerImageSelectionApplication from "./container-image-selection-application.js";
import {
	createOwnedItem,
	currencyCollected,
	itemCollected,
	updateActor,
	updateEntity
} from './main';
import { ItemType, ContainerLoot, PickUpStixFlags } from "./models";
import { SettingKeys } from './settings';
import { ContainerSoundConfig } from './container-sound-config-application';

/**
 * Application class to display to select an item that the token is
 * associated with
 */
export default class ItemConfigApplication extends FormApplication {
	private _tokenDeletedHandler;
	private _tokenUpdatedHandler;
	private _html: any;
	private _currencyEnabled: boolean;

	static get defaultOptions(): ApplicationOptions {
		return mergeObject(super.defaultOptions, {
			closeOnSubmit: false,
			submitOnClose: false,
			submitOnChange: true,
			id: "pick-up-stix-item-config",
			template: "modules/pick-up-stix/module/pick-up-stix/templates/item-config.html",
			width: 720,
			minimizable: false,
			title: `${game.user.isGM ? 'Configure Loot Container' : 'Loot Container'}`,
			resizable: true,
			classes: ['pick-up-stix', 'item-config-sheet'],
			dragDrop: [{ dropSelector: null }]
		});
	}

	constructor(private _token: Token, private _controlledToken: Token) {
		super(_token, {});

		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | constructor called with:`)
		console.log([this._token, this._controlledToken]);

		this._currencyEnabled = !game.settings.get('pick-up-stix', SettingKeys.disableCurrencyLoot);

		this._tokenDeletedHandler = Hooks.on('deleteToken', this._tokenDeleted.bind(this));
		this._tokenUpdatedHandler = Hooks.on('updateToken', this._tokenUpdated.bind(this));
	}

	protected _tokenUpdated(scene: Scene, tokenData: any, tokenFlags: any, userId: string): void {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | _tokenUpdated called with args:`);
		console.log([scene, tokenData, tokenFlags, userId]);
		this.render();
	}

	protected _tokenDeleted(scene: Scene, tokenData: any, data: any, userId: string) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | _tokenDeleted called with args:`);
		console.log([scene, tokenData, data, userId]);

		if (tokenData._id === this._token.id) {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | _tokenDeleted | token ID matches this app's token`)
			this.close();
		}
	}

	activateListeners(html) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | activateListeners`);
		console.log(this);
		this._html = html;
		super.activateListeners(this._html);

		$(html)
			.find('input')
			.on('focus', e => e.currentTarget.select())
			.addBack()
			.find('[data-dtype="Number"]')
			.on('change', _onChangeInputDelta.bind(this.object));

		// set the click listener on the image
		if (game.user.isGM) {
			$(html)
				.find(`[data-edit="img"]`)
				.on('click', e => this._onEditImage(e))
				.css('cursor', 'pointer');
		}

		// set click listeners on the buttons to pick up individual items
		$(html).find(`a.item-take`).on('click', e => this._onTakeItem(e));

		// set click listeners on the buttons to delete items
		$(html).find(`a.item-delete`).on('click', e => this._onDeleteItem(e));

		if (game.user.isGM) {
			$(html)
				.find('.configure-sound')
				.css('cursor', 'pointer')
				.on('click', e => this._onConfigureSound(e));

			$(html)
				.find('.configure-keys')
				.css('cursor', 'pointer')
				.on('click', e => this._onConfigureKeys(e));
		}

		if (this._currencyEnabled) {
			// set click listener for taking currency
			$(html).find(`a.currency-take`).on('click', e => this._onTakeCurrency(e));
		}

		$(html).find(`input[type="text"]`).prop('readonly', !game.user.isGM);
		$(html).find(`input[type="text"]`).prop('disabled', 	!game.user.isGM);

		$(html).find('input#canCloseCheckbox').prop('checked', this._token.getFlag('pick-up-stix', 'pick-up-stix.canClose') ?? true);

		if (this._token) {
			$(html).find('input#scale').val(this._token?.data?.width ?? 1);
		}

		if (!game.user.isGM) {
			$(html).find(`input[type="text"]`).addClass('isNotGM');
		}
	}

	private _onConfigureKeys(e): void {
    console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | _onConfigureKeys`);


	}

	private _onConfigureSound(e): void {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | _onConfigureSound`);

		const f = new ContainerSoundConfig(this.object, {}).render(true);
	}

	getData() {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | getData:`);
		const itemType = this._token.getFlag('pick-up-stix', 'pick-up-stix.itemType');
		const quantityDataPath = getQuantityDataPath();
		const priceDataPath = getPriceDataPath();
		const tokenLoot: ContainerLoot = duplicate(this.object.getFlag('pick-up-stix', `pick-up-stix.container.loot`) ?? {});
		const loot = Object.entries(tokenLoot).reduce((prev, [lootKey, lootItems]) => {
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

		let containerDescription = this._token.getFlag('pick-up-stix', 'pick-up-stix.container.description') ?? '';
		containerDescription = containerDescription.replace(/font-size:\s*\d*.*;/, 'font-size: 16px;');

		const currencyTypes = getCurrencyTypes();

		const data = {
			currencyEnabled: this._currencyEnabled,
			currencyTypes: Object.entries(currencyTypes).map(([k, v]) => ({ short: k, long: v })),
			currency: duplicate(this._token.getFlag('pick-up-stix', 'pick-up-stix.container.currency') ?? {}),
			lootTypes: Object.keys(loot),
			loot,
			profileImage: itemType === ItemType.CONTAINER ? this._token.getFlag('pick-up-stix', 'pick-up-stix.container.imageOpenPath') : this._token.data.img,
			isContainer: itemType === ItemType.CONTAINER,
			containerDescription,
			isToken: this._token instanceof Token,
			object: this._token.data,
			user: game.user,
			quantityDataPath,
			numberOfKeys: this.object.getFlag('pick-up-stix', 'pick-up-stix.container.keys')?.length ?? 0
		};

		if (this._currencyEnabled) {
			;
		}

		console.log(data);
		return data;
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
		const actor: Actor = this._controlledToken?.actor;
		if (!actor) {
			ui.notifications.error('You must be controlling only one token to pick up an item');
			return;
		}

		// TODO: this code will need to be updated to support different system's currencies
		const actorCurrency = { ...getProperty(actor, 'data.data.currency') ?? {} };

		const currency = duplicate(this.object.getFlag('pick-up-stix', 'pick-up-stix.container.currency') ?? {});
		if (!Object.values(currency).some(c => c > 0)) {
			console.log(`pick-up-stix | ItemCOnfigApplication ${this.appId} | _onTakeCurrency | No currency to loot`);
			return;
		}

		Object.keys(actorCurrency).forEach(k => actorCurrency[k] = +actorCurrency[k] + +currency[k]);
		await updateActor(actor, {'data.currency': actorCurrency});

		currencyCollected(this._controlledToken, Object.entries(currency).filter(([, v]) => v > 0).reduce((prev, [k, v]) => { prev[k] = v; return prev; }, {}));

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
		const actor = this._controlledToken?.actor;
		if (!actor) {
			ui.notifications.error('You must be controlling only one token to pick up an item');
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

		await createOwnedItem(actor, [{
			...duplicate(itemData),
			data: {
				...duplicate(itemData.data),
				[getQuantityDataPath()]: 1
			}
		}]);

		itemCollected(this._controlledToken, itemData);

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

	protected _onEditImage(e) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onEditImage`);

		if (this._token.getFlag('pick-up-stix', 'pick-up-stix.itemType') === ItemType.CONTAINER) {
			const f = new ContainerImageSelectionApplication(this._token).render(true);
			Hooks.once('closeContainerImageSelectionApplication', () => {
				console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | closeContainerImageSelectionApplication hook`);
				const img =
					this._token.getFlag('pick-up-stix', 'pick-up-stix.container.isOpen') ?
					this._token.getFlag('pick-up-stix', 'pick-up-stix.container.imageOpenPath') :
					this._token.getFlag('pick-up-stix', 'pick-up-stix.container.imageClosePath');
				this._token.update({ img });
			});
			return;
		}

		const attr = e.currentTarget.dataset.edit;
    const current = getProperty(this.object.data, attr);
    const fp = new FilePicker({
      type: "image",
      current: current,
      callback: path => {
        e.currentTarget.src = path;
        if (this.options.submitOnChange) {
          this._onSubmit(e);
        }
      },
      top: this.position.top + 40,
      left: this.position.left + 10
    });
    fp.browse(current);
	}

	protected async _onDrop(e) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop with data:`);
		const droppedData = JSON.parse(e.dataTransfer.getData('text/plain'));
		console.log(droppedData);

		if (droppedData.type !== "Item") {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop | item is not 'Item' type`);
			return;
		}

		let itemData;
		const coreVersion = game.data.verson;
		const is7Newer = isNewerVersion(coreVersion, '0.6.9');

		// if the item came from an actor's inventory, then it'll have an actorId property,
		// we'll need to remove the item from that actor
		const actor =
			droppedData.actorId ?
			(
				is7Newer ?
					(
						droppedData.tokenId ?
							game.actors.tokens[droppedData.tokenId] :
							game.actors.get(droppedData.actorId)
					) :
					canvas.tokens?.controlled?.[0]?.actor
			) :
			null;

		// ensure we have a controlled token so that we know which token's actor if need be that we will
		// be interacting with. We only need to do this for versions lower than 0.7.0 because 0.7.0
		// contains more data in the drop data that we need
		if (actor && canvas.tokens.controlled.length !== 1 && !is7Newer) {
			ui.notifications.error(`Please ensure you are only controlling the token (and only the one token) for the character you're working with.`);
			return;
		}

		if (!actor && droppedData.actorId) {
			ui.notifications.error(`No valid actor found for actor '${droppedData.actorId}', please ensure you are controlling the token (and only the one token) for the character you're working with`);
			return;
		}

		// if the dropped item comes from an actor, we need to delete the item from that actor
		if (actor) {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop | drop data contains actor ID '${actor.id}', delete item from actor`);
			itemData = duplicate(droppedData.data);
			await actor.deleteOwnedItem(itemData._id);
		}
		else {
			itemData = await game.items.get(droppedData.id)?.data ?? await game.packs.get(droppedData.pack).getEntry(droppedData.id);
		}

		const itemType = itemData.type;
		const lootTokenFlags: PickUpStixFlags = duplicate(this.object.getFlag('pick-up-stix', 'pick-up-stix') ?? {});
		const loot: ContainerLoot = lootTokenFlags?.container?.loot ?? {};
		if (!loot[itemType]) {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop | no items of type '${itemType}', creating new slot`);
			loot[itemType] = [];
		}
		const qtyDataPath = getQuantityDataPath();
		const existingItem = loot[itemType]?.find(i => i._id === (actor ? getProperty(itemData, 'flags.pick-up-stix.pick-up-stix.originalItemId') : itemData._id));
		if (existingItem) {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop | existing data for type '${itemType}', increase quantity by 1`);
			setProperty(existingItem.data, qtyDataPath, getProperty(existingItem.data, qtyDataPath) + 1)
		}
		else {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop | existing data for item '${itemData._id}' does not exist, set quantity to 1 and add to slot`);
			setProperty(itemData.data, qtyDataPath, 1);
			loot[itemType].push({
				...itemData
			});
		}

		const updateData = {
			flags: {
				'pick-up-stix': {
					'pick-up-stix': {
						container: {
							loot
						}
					}
				}
			}
		};
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | _onDrop | submit data:`);
		console.log(updateData);
		await this.submit({ updateData });
	}

	protected async _updateObject(e, formData) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | _updateObject called with args:`);
		console.log([e, duplicate(formData)]);

		const tokenLoot: ContainerLoot = duplicate(this.object.getFlag('pick-up-stix', `pick-up-stix.container.loot`) ?? {});

		if (e.type === 'change') {
			Object.entries(tokenLoot).forEach(([lootType, v]) => {
				if (v.length === 0) {
					return;
				}

				setProperty(formData, `flags.pick-up-stix.pick-up-stix.container.loot.${lootType}`, v.map(itemData => {
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

		if (this._token.getFlag('pick-up-stix', 'pick-up-stix.itemType') === ItemType.CONTAINER) {
			formData.img = this._token.getFlag('pick-up-stix', 'pick-up-stix.container.isOpen') ? this._token.getFlag('pick-up-stix', 'pick-up-stix.container.imageOpenPath') : this._token.getFlag('pick-up-stix', 'pick-up-stix.conatiner.imageClosePath');
		}

		if (this._currencyEnabled) {
			// when the user is a GM the currency is taken from the inputs on the form, but when the user NOT a GM, there are no inputs
			if (!game.user.isGM) {
				if (tokenLoot.currency) {
					setProperty(formData, `flags.pick-up-stix.pick-up-stix.container.loot.currency`, { ...tokenLoot.currency });
				}
			}
		}

		if (formData.width !== undefined) {
			// we only collect the one size and store it as the width, so here we also store the height to be the same
			formData.height = formData.width;
		}

		const flattendOb = flattenObject(formData);
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | _updateObject | flattend 'formData' object:`);
		console.log(flattendOb);
		await updateEntity(this._token, flattendOb);
		this.render();
	}

	async close() {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | close`);
		Hooks.off('deleteToken', this._tokenDeletedHandler);
		Hooks.off('updateToken', this._tokenUpdatedHandler);
		return super.close();
	}
}
