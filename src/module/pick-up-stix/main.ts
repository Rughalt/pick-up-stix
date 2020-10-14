import { PickUpStixFlags, PickUpStixSocketMessage, SocketMessageType, ItemType, DropData } from "./models";
import { dist, getCurrencyTypes } from '../../utils'
import { SettingKeys } from "./settings";
import { LootToken } from "./loot-token";

declare function fromUuid(uuid: string): Entity;

export interface LootTokenData {
	[sceneId: string]: {
		[tokenId: string]: PickUpStixFlags
	}
}

export const lootTokens: LootToken[] = [];
window['lootTokens'] = lootTokens;

export const getLootTokenData = (): LootTokenData => {
	return duplicate(game.settings.get('pick-up-stix', SettingKeys.lootTokenData));
}

export const getLootToken = (sceneId, tokenId): LootToken => {
	return lootTokens.find(lt => lt.sceneId === sceneId && lt.tokenId === tokenId);
}

export const saveLootTokenData = async (sceneId: string, tokenId: string, lootData: PickUpStixFlags): Promise<void> => {
	console.log('pick-up-stix | saveLootTokenData | saving loot token data to the settings DB');
	const currentData = duplicate(getLootTokenData());

	mergeObject(currentData, { [sceneId]: { [tokenId]: lootData } });

	if (game.user.isGM) {
		await game.settings.set('pick-up-stix', SettingKeys.lootTokenData, currentData);
		Hooks.callAll('pick-up-stix.saveLootTokenData', sceneId, tokenId, duplicate(lootData));
		return;
	}

	const msg: PickUpStixSocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.saveLootTokenData,
		data: {
			sceneId,
			tokenId,
			lootData
		}
	};

	game.socket.emit('module.pick-up-stix', msg, () => {
		console.log(`pick-up-stix | saveLootTokenData | socket message handled`);
	});
}

export const deleteLootTokenData = async (sceneId: string, tokenId: string): Promise<void> => {
	console.log(`pick-up-stix | deleteLootTokenData | deleteting loot for token '${tokenId} from scene ${sceneId}`);
	const lootTokenData = duplicate(getLootTokenData());

	let data;
	try {
		data = duplicate(lootTokenData?.[sceneId]?.[tokenId]);
	}
	catch (e) {
		data = null;
	}

	if (!data) {
		console.log('pick-up-stix | deleteLootTokenData | data not found, no need to delete');
		return;
	}

	if (game.user.isGM) {
		delete lootTokenData?.[sceneId]?.[tokenId];
		await game.settings.set('pick-up-stix', SettingKeys.lootTokenData, lootTokenData);
		lootTokens.findSplice(t => t.sceneId === sceneId && t.tokenId === tokenId);
		return;
	}

	const msg: PickUpStixSocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.deleteLootTokenData,
		data: {
			sceneId,
			tokenId
		}
	};

	game.socket.emit('module.pick-up-stix', msg, () => {
		console.log(`pick-up-stix | deleteLootTokenData | socket message handled`);
	});
}

export const getValidControlledTokens = (token): Token[] => {
	if (!token) {
		return [];
	}

	const maxDist = Math.hypot(canvas.grid.size, canvas.grid.size);
	const controlled = canvas.tokens.controlled.filter(t => {
		if (!t.actor) {
			return false;
		}

		const d = dist(t, token);
		console.log(`${t.actor.name} at ${t.x}, ${t.y}`);
		console.log(`${t.actor.name} is ${d} units from ${token.name}. Max dist ${maxDist}`);
		const lootData = getLootTokenData()[t.scene.id]?.[t.id];
		return !lootData && d < (maxDist + 20)
	});

	return controlled;
}

export const normalizeDropData = (data: DropData, event?: any): any => {
	console.log('pick-up-stix | normalizeDropData called with args:');
	console.log([data, event]);

	// TODO: in version 0.7.0 and above, are the x and y already correct?
	if (event) {
		// Acquire the cursor position transformed to Canvas coordinates
		const [x, y] = [event.clientX, event.clientY];
		const t = canvas.stage.worldTransform;
		data.x = (x - t.tx) / canvas.stage.scale.x;
		data.y = (y - t.ty) / canvas.stage.scale.y;
	}

	const coreVersion = game.data.verson;
	const is7Newer = isNewerVersion(coreVersion, '0.6.9');

	if (data.actorId) {
		let actor;

		if (is7Newer) {
			actor = data.tokenId ? game.actors.tokens[data.tokenId] : game.actors.get(data.actorId);
		}
		else {
			// if Foundry is 0.6.9 or lower then there is no good way to tell which user-controlled token
			// that the item comes from. We only have the actor ID and multiple tokens could be associated with
			// the same actor. So we check if the user is controlling only one token and use that token's actor
			// reference, otherwise we say there is no actor.
			actor = canvas?.tokens?.controlled?.length === 1 ? canvas.tokens?.controlled?.[0]?.actor : null;
		}

		data.actor = actor;
	}

	return data;
}

/**
 * Handles data dropped onto the canvas.
 *
 * @param dropData
 */
export async function handleItemDropped(dropData: DropData) {
	console.log(`pick-up-stix | handleItemDropped | called with args:`);
	console.log(dropData);

	// The data here should already be normalized, meaning that if we were able to determine the actor reference,
	// it should exist here. So if we have an actor ID but no actor, that means we weren't able to figure out
	// which actor this item might have come from.
  if (dropData.actorId && !dropData.actor) {
    ui.notifications.error(`Please ensure you are only controlling the token (and only the one token) for the character you're working with.`);
    return;
	}

	let pack: string;
  let itemData: any;

  // if the item comes from an actor's inventory, then the data structure is a tad different, the item data is stored
	// in a data property on the dropData parameter rather than on the top-level of the dropData
	if (dropData.actor) {
		console.log(`pick-up-stix | handleItemDropped | actor '${dropData.actor.id}' dropped item, get item data from the dropped item's original item data`);
		itemData = duplicate(dropData.data);
		await dropData.actor.deleteOwnedItem(dropData.data._id);
	}
	else {
		console.log(`pick-up-stix | handleItemDropped | item comes from directory or compendium, item data comes from directory or compendium`);
		pack = dropData.pack;
		const id = dropData.id;
		const item: Item = await game.items.get(id) ?? await game.packs.get(pack)?.getEntity(id);
		if (!item) {
			console.log(`pick-up-stix | handleItemDropped | item '${id}' not found in game items or compendium`);
			return;
		}
		itemData = duplicate(item.data);
	}

	const droppedItemIsContainer = getProperty(itemData, 'flags.pick-up-stix.pick-up-stix.itemType') === ItemType.CONTAINER;

	let targetToken: Token;
	let p: PlaceableObject;
	// loop through placeables on the map and see if it's being dropped onto a token
	for (p of canvas.tokens.placeables) {
		if (dropData.x < p.x + p.width && dropData.x > p.x && dropData.y < p.y + p.height && dropData.y > p.y && p instanceof Token) {
			// dropped it onto a token, set the targetToken
			targetToken = p;
			break;
		}
	}

	// if the drop was on another token, check what type of token it was dropped on
	if (targetToken) {
		if (droppedItemIsContainer) {
			ui.notifications.error('Cannot drop container onto target');
			return;
		}

		if (targetToken.actor) {
			// if the token it was dropped on was an actor, add the item to the new actor
			await createOwnedItem(
				targetToken.actor,
				[duplicate(itemData)]
			);
			return;
		}

		console.log(`pick-up-stix | handleItemDropped | item dropped onto target token '${targetToken.id}'`);
		const lootToken: LootToken = getLootToken(canvas.scene.id, targetToken.id);

		if (!lootToken) {
			console.error(`pick-up-stix | handleItemDroped | LootToken instance not found for token ${targetToken.id} on scene ${canvas.scene.id}`);
			return;
		}

		if (lootToken.itemType === ItemType.CONTAINER) {
			const id = dropData.actor ? getProperty(itemData, 'flags.pick-up-stix.pick-up-stix.originalItemId') : itemData._id
			await lootToken.addItem(itemData, id);
			return;
		}
	}

	// if it's not a container, then we can assume it's an item. Create the item token
	const hg = canvas.dimensions.size * .5;
	const { x, y } = canvas.grid.getSnappedPosition(dropData.x - hg, dropData.y - hg, 1);

	// if the item being dropped is a container, just create the empty container
	if (droppedItemIsContainer) {
		console.log(`pick-up-stix | handleItemDropped | dropped item is a container`);
		const lootToken = await LootToken.create(
			{
				name: itemData.name,
				img: itemData.img,
				x,
				y,
				disposition: 0
			},
			duplicate(itemData.flags['pick-up-stix']['pick-up-stix'])
		);

		lootTokens.push(lootToken);
		return;
	}

	let tokenData = {
		name: itemData.name,
		disposition: 0,
		x,
		y,
		img: itemData.img
	}

	let lootData = {
		itemType: ItemType.ITEM,
		itemData: {
			...itemData
		}
	}

	let lootToken: LootToken;

	// if a Token was successfully created
	if (!dropData.actor) {
		await new Promise(resolve => {
			// render the item type selection form
			new Dialog({
				content: 'What kind of loot is this?',
				default: 'one',
				title: 'Loot Type',
				buttons: {
					one: {
						icon: '<i class="fas fa-box"></i>',
						label: 'Item',
            callback: async () => {
							lootToken = await LootToken.create(tokenData, lootData);
							resolve();
            }
					},
					two: {
						icon: '<i class="fas fa-boxes"></i>',
						label: 'Container',
						callback: async () => {
							const img: string = game.settings.get('pick-up-stix', SettingKeys.closeImagePath);
							lootToken = await LootToken.create(duplicate({ ...tokenData, img }), {
								itemType: ItemType.CONTAINER,
								isLocked: false,
								container: {
									currency: Object.keys(getCurrencyTypes()).reduce((acc, shortName) => ({ ...acc, [shortName]: 0 }), {}),
									canClose: true,
									isOpen: false,
									imageClosePath: img,
									imageOpenPath: game.settings.get('pick-up-stix', SettingKeys.openImagePath),
									soundOpenPath: game.settings.get('pick-up-stix', SettingKeys.defaultContainerOpenSound),
									soundClosePath: game.settings.get('pick-up-stix', SettingKeys.defaultContainerCloseSound)
								}
							});
							resolve();
						}
					}
				}
			}).render(true);
		});
	}
  else {
		lootToken = await LootToken.create(tokenData, lootData);
	}

	lootTokens.push(lootToken);
}

export async function toggleItemLocked(e): Promise<any> {
	console.log(`pick-up-stix | toggleItemLocked`);

	const clickedToken: Token = this;
	const flags: PickUpStixFlags = clickedToken.getFlag('pick-up-stix', 'pick-up-stix');
	await clickedToken.setFlag('pick-up-stix', 'pick-up-stix.isLocked', !flags.isLocked);
}

export async function updateEntity(entity: { id: string, update: (data, options?) => void }, updates): Promise<void> {
	console.log(`pick-up-stix | updateEntity with args:`);
	console.log([entity, updates]);

	if (game.user.isGM) {
		await entity.update(updates);
		return;
	}

	const msg: PickUpStixSocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.updateEntity,
		data: {
			tokenId: entity.id,
			updates
		}
	};

	game.socket.emit('module.pick-up-stix', msg, () => {
		console.log(`pick-up-stix | updateEntity | socket message handled`);
	});
}

export async function updateActor(actor, updates): Promise<void> {
	if (game.user.isGM) {
		await actor.update(updates);
		return;
	}

	const msg: PickUpStixSocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.updateActor,
		data: {
			actorId: actor.id,
			updates
		}
	};

	game.socket.emit('module.pick-up-stix', msg);
}

export async function createOwnedItem(actor: Actor, items: any[]) {
	if (game.user.isGM) {
		await actor.createOwnedItem(items);
		return;
	}

	const msg: PickUpStixSocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.createOwnedEntity,
		data: {
			actorId: actor.id,
			items
		}
	};

	game.socket.emit('module.pick-up-stix', msg, () => {
		console.log(`pick-up-stix | createOwnedEntity | socket message handled`);
	});
}

export const createEntity = async (data: any, options: any = {}): Promise<Entity> => {
	console.log(`pick-up-stix | createEntity | called with args:`);
	console.log([data]);

	if (game.user.isGM) {
		const e = await Item.create(data, options);
		return e
	}

	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(null);
		}, 2000);

		const msg: PickUpStixSocketMessage = {
			sender: game.user.id,
			type: SocketMessageType.createEntity,
			data: {
				data,
				options
			}
		};

		game.socket.emit('module.pick-up-stix', msg, () => {
			console.log('pick-up-stix | createEntity | socket message handled');
			Hooks.once('createItem', (item, options, userId) => {
				console.log(`pick-up-stix | createEntity | createItem hook | item '${item.id}' created`);
				clearTimeout(timeout);
				resolve(item);
			});
		});
	});
}

export const deleteEntity = async (uuid: string) => {
	console.log('pick-up-stix | deleteEntity | called with args:');
	console.log([uuid]);

	const e = await fromUuid(uuid);

	if (!e) {
		console.log(`pick-up-stix | deleteEntity | entity not found from uuid '${uuid}'`);
		return uuid;
	}

	if (game.user.isGM) {
		console.log('pick-up-stix | deleteEntity | user is GM:');
		return await e.delete();
	}

	console.log('pick-up-stix | deleteEntity | user is not GM:');
	const msg: PickUpStixSocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.deleteEntity,
		data: {
			uuid
		}
	}

	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(uuid);
		}, 2000);
		game.socket.emit('module.pick-up-stix', msg, () => {
			console.log('pick-up-stix | deleteEntity | socket message handled');
			Hooks.once('deleteItem', (item, options, userId) => {
				console.log('pick-up-stix | deleteEntity | deleteItem hook');
				clearTimeout(timeout);
				resolve(item.id);
			});
		})
	})

}

export const createToken = async (data: any): Promise<string> => {
	console.log(`pick-up-stix | createToken | called with args:`);
	console.log(data);

	if (game.user.isGM) {
		console.log(`pick-up-stix | createToken | current user is GM, creating token`);
		const t = await Token.create({
			...data
		});
		return t.id;
	}

	console.log(`pick-up-stix | createToken | current user is not GM, send socket message`);
	const msg: PickUpStixSocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.createItemToken,
		data
	}

	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject('Token never created');
		}, 2000);

		game.socket.emit('module.pick-up-stix', msg, () => {
			console.log(`pick-up-stix | createToken | socket message handled`);

			Hooks.once('createToken', (scene, data) => {
				// TODO: could possibly add a custom authentication ID to the data we emit, then we can
				// check that ID against this created token ID and make sure we are getting the right one. Seems
				// like it could be rare, but there could be a race condition with other tokens being created
				// near the same time we are creating this token. Maybe through other modules doing it.
				console.log(`pick-up-stix | createToken | createToken hook | Token '${data.id}' created`);
				clearTimeout(timeout);
				resolve(data._id);
			});
		});
	});
}

export const currencyCollected = (token, currency) => {
	console.log(`pick-up-stix | currencyCollected | called with args:`);
	console.log([token, currency]);
	let chatContent = '';
	Object.entries(currency).forEach(([k, v]) => {
		chatContent += `<span class="pick-up-stix-chat-currency ${k}"></span><span>(${k}) ${v}</span><br />`;
	});
	let content = `<p>Picked up:</p>${chatContent}`;
	ChatMessage.create({
		content,
		speaker: {
			alias: token.actor.name,
			scene: token.scene.id,
			actor: token.actor.id,
			token: token.id
		}
	});
}

export const itemCollected = (token, item): void => {
	ChatMessage.create({
		content: `
			<p>Picked up ${item.name}</p>
			<img src="${item.img}" style="width: 40px;" />
		`,
		speaker: {
			alias: token.actor.name,
			scene: token.scene.id,
			actor: token.actor.id,
			token: token.id
		}
	});
}