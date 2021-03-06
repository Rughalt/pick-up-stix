import { log } from "../../log";




export enum SettingKeys {
	openImagePath = 'default-container-opened-image-path',
	closeImagePath = 'default-container-closed-image-path',
	disableCurrencyLoot = 'disable-currency-loot',
	defaultContainerCloseSound = 'default-container-close-sound',
	defaultContainerOpenSound = 'default-container-open-sound',
	version = 'version',
	lootTokenData = 'lootTokenData',
	parentItemFolderId = 'parentFolderId',
	tokenFolderId = 'tokenFolderId',
	itemFolderId = 'itemFolderId',
	version13updatemessage = 'version13updatemessage',
	GMActionTimeout = 'GMActionTimeout',
	addItemOnContainerCreation = 'addItemOnContainerCreation',
	enableLootTokenPerceiveReveal = 'enableLootTokenPerceiveReveal'
}

const systemCurrenciesImplemented = [
	'dnd5e'
];

export const gmActionTimeout = (multiplier: number = 1000): number => {
	return (game.settings.get('pick-up-stix', SettingKeys.GMActionTimeout) ?? 2) * multiplier;
}

const imageTypeFunc = (val) => {
	return val;
}
Object.defineProperty(imageTypeFunc, 'name', {value: 'pick-up-stix-settings-image'});

const audioTypeFunc = (val) => {
	return val;
}
Object.defineProperty(audioTypeFunc, 'name', {value: 'pick-up-stix-settings-audio'});

export const registerSettings = function() {
	log(`pick-up-stix | registerSettings`);
	registerHiddenSettings();
	registerWorldSettings();
	registerClientSettings();
}

const registerHiddenSettings = () => {
	game.settings.register('pick-up-stix', SettingKeys.GMActionTimeout, {
		name: 'GM Action Timeout',
		hint: 'Controls the amount of time to wait for a GM client to perform a GM action before giving up',
		scope: 'world',
		type: Number,
		default: 2,
		config: false
	});

  game.settings.register('pick-up-stix', SettingKeys.version13updatemessage, {
    name: 'Version 13 Update Message',
    hint: 'Tracks if user received the version 13 update message',
    scope: 'world',
    config: false,
    type: Boolean,
    default: false
  });

	game.settings.register('pick-up-stix', SettingKeys.version, {
		name: 'Version',
		hint: 'Used to track which version is last loaded, so that we can give updates to users',
		scope: 'world',
		config: false,
		type: String,
		default: '0.0.0'
	});

	game.settings.register('pick-up-stix', SettingKeys.parentItemFolderId, {
		name: 'Parent Item Folder ID',
		hint: 'The folder ID of the main Pick-Up-Stix folder in the Items Directory',
		scope: 'world',
		config: false,
		type: String
	});

	game.settings.register('pick-up-stix', SettingKeys.itemFolderId, {
		name: 'Items Folder ID',
		hint: 'The Folder ID of the sub folder to hold templates for loot',
		scope: 'world',
		config: false,
		type: String
	});

	game.settings.register('pick-up-stix', SettingKeys.tokenFolderId, {
		name: 'Tokens folder ID',
		hint: 'The Folder ID of the sub folder to hold Items representing tokens',
		scope: 'world',
		config: false,
		type: String
	});
}

const registerWorldSettings = () => {
	game.settings.register('pick-up-stix', SettingKeys.enableLootTokenPerceiveReveal, {
		name: 'Loot Token Reveal',
		hint: `Enables auto-revealing loot tokens that players with controlled tokens are able to see with their passive 'perceive' value.`,
		scope: 'world',
		config: game.system.id === 'dnd5e',
		type: Boolean,
		default: game.system.id === 'dnd5e'
	});

	game.settings.register('pick-up-stix', SettingKeys.openImagePath, {
		name: 'Default Container Opened Image',
		hint: 'Sets the path for the default image to use for opened containers',
		scope: 'world',
		config: true,
		type: imageTypeFunc,
		default: 'modules/pick-up-stix/assets/chest-opened.png'
	});

	game.settings.register('pick-up-stix', SettingKeys.closeImagePath, {
		name: 'Default Container Closed Image',
		hint: 'Sets the path for the default image to use for closed containers',
		scope: 'world',
		config: true,
		type: imageTypeFunc,
		default: 'modules/pick-up-stix/assets/chest-closed.png'
	});

	game.settings.register('pick-up-stix', SettingKeys.disableCurrencyLoot, {
		name: 'Disable Currency Loot',
		hint: `This option is enabled by default for systems that have not been implemented in Pick-Up-Stix yet. You can also use it to manually disable currency if you don't wish to have currency as loot.`,
		scope: 'world',
		config: true,
		type: Boolean,
		default: !systemCurrenciesImplemented.includes(game.system.id)
	});

	game.settings.register('pick-up-stix', SettingKeys.defaultContainerOpenSound, {
		name: 'Default Container Open Sound',
		hint: 'The default sound to play when opening a container.',
		scope: 'world',
		type: audioTypeFunc,
		config: true
	});

	game.settings.register('pick-up-stix', SettingKeys.defaultContainerCloseSound, {
		name: 'Default Container Close Sound',
		hint: 'The default sound to play when closing a container.',
		scope: 'world',
		type: audioTypeFunc,
		config: true
	});

	game.settings.register('pick-up-stix', SettingKeys.addItemOnContainerCreation, {
		name: 'Auto-add Item',
		hint: `When enabled and dragging an Item to the canvas in order to create a container, the Item used to create the container will automatically be added to the created container rather than creating an empty container.`,
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	});
}

const registerClientSettings = () => {

}

export function processHtml(html) {
	$(html)
		.find('input[data-dtype="pick-up-stix-settings-image"')
		.each(function() {
			const settingName = $(this).attr('name').split('.')[1];
			log(settingName);

			let picker = new FilePicker({
				type: 'image',
				current: game.settings.get('pick-up-stix', settingName),
				field: $(this)[0]
			});

			let pickerButton = $('<button type="button" class="file-picker" title="Pick image"><i class="fas fa-file-import fa-fw"></i></button>');
			pickerButton.on("click", function () {
				picker.render(true);
			});
			$(this).parent().append(pickerButton);
		});

		$(html)
		.find('input[data-dtype="pick-up-stix-settings-audio"')
		.each(function() {
			const settingName = $(this).attr('name').split('.')[1];
			log(settingName);

			let picker = new FilePicker({
				type: 'audio',
				current: game.settings.get('pick-up-stix', settingName),
				field: $(this)[0]
			});

			let pickerButton = $('<button type="button" class="file-picker" title="Pick image"><i class="fas fa-file-import fa-fw"></i></button>');
			pickerButton.on("click", function () {
				picker.render(true);
			});
			$(this).parent().append(pickerButton);
		})
}
