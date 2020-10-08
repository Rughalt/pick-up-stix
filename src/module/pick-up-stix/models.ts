export interface PickUpStixFlags {
	itemType: ItemType;

	// if the item becomes an owned item, then we need to know who the owner is
	owner?: string;

	// if the item becomes an owned item, then we need to konw the original item ID
	// because it gets removed when it becomes an owned item and new ID is
	// given to the owned item. We need this original ID to determine if the item
	// matches other items such as in containers so that we can stack them properly
	originalItemId?: string;

	// itemId is used when an Item is added to an Actor's inventory. When an Item in
	// Foundry is added to an Actor's inventory, then it ceases to be an Item and
	// becomes an OwnedItem and loses it's original id, the OwnedItem then has a new
	// id. So this keeps track of what the original Item id was so that it can be
	// used elsewhere
	itemId?: string;

	// used to store information about an item while it is represented by a token
	// should only exist on token instances
	itemData?: any;

	isLocked?: boolean;
	container?: {
		soundOpenPath: string;
		soundClosePath: string;
		imageClosePath: string;
		imageOpenPath: string;
		canClose: boolean;
		isOpen: boolean;
		loot?: ContainerLoot;
		currency?: any;
		description?: string;
	}
}

export interface ContainerLoot {
	[key: string]: any[];
}

export enum SocketMessageType {
	deleteToken,
	updateEntity,
	updateActor,
	createOwnedEntity,
	createItemToken
}

export interface PickUpStixSocketMessage {
	// user ID of the sender
	sender: string;
	type: SocketMessageType;
	data: any;
}

export enum ItemType {
	NONE = 'none',
	ITEM = 'item',
	CONTAINER = 'container'
}
