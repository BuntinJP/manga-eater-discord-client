import { getImageUrl } from './utils/reddit';
import { Command, CommandAction } from './types';
import { commands } from './commands';
//import { ModalBuilder } from 'discord.js';
import * as testModal from './modals/testModal.json';
import * as dcUtils from './utils/discordUtils';
import * as meUtils from './utils/meUtils';
import {
  ExtendedAPIModalInteractionResponse,
  BaseOption,
  BC_GeneralPayload,
} from './types';

const msg = 4;
const deffer = 5;
const modal = 9;

import * as dc from './utils/discordUtils';
import { InteractionResponseType } from 'discord.js';

const down = {
  type: msg,
  data: {
    content: 'server is down',
  },
};

const err = {
  type: msg,
  data: {
    content: 'error',
  },
};

const testurl = 'https://www.reddit.com/r/EGirls/hot.json';
const actions: CommandAction[] = [
  //info
  async (env) => {
    console.log('Handling info request');
    //check server
    if (!(await meUtils.checkMEserver(`${env.SERVER_URL}/version`))) {
      return down;
    }
    const serverUrl = env.SERVER_URL;
    const state = await fetch(`${serverUrl}/version/info`);
    const info = await state.json();
    const jsonString = JSON.stringify(info, null, 2);
    console.log(jsonString);
    return {
      type: msg,
      data: {
        content: `Cloudflare Worker Bot Client Version : ${env.VERSION}\nServer Status: \n${jsonString}`,
      },
    };
  },
  //help
  async () => ({
    type: msg,
    data: {
      content: 'ヘルプはこちら\n(https://github.com/BuntinJP/badcompany)',
    },
  }),
  //hnti
  async () => {
    const imageUrl = await getImageUrl(testurl);
    return {
      type: msg,
      data: {
        content: imageUrl,
      },
    };
  },
  //invite
  async (env) => {
    const applicationId = env.DISCORD_APPLICATION_ID;
    const INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${applicationId}&scope=applications.commands`;
    return {
      type: msg,
      data: {
        content: INVITE_URL,
        flags: 64,
      },
    };
  },
  //me-titles
  async (env) => {
    const directory = await meUtils.getDir(env.SERVER_URL);
    const titles = directory.titles;
    return {
      type: msg,
      data: {
        content: dc.genTable(titles),
      },
    };
  },
  //me-title
  async (env, interaction) => {
    const options = interaction?.data?.options as BaseOption[];
    const index = options[0].value as number;
    const dir = await meUtils.getDir(env.SERVER_URL);
    if (dir.titles.length < index) {
      return err;
    }
    const title = dir.titles[index];
    const eps = dir.outbound[index].episodes.map((ep) =>
      meUtils.trimZero(ep.split('-').shift() || 'err')
    );
    return {
      type: msg,
      data: {
        content: `index \`${index}\`\n\ntitle \`${title}\`\n\navailable episodes\n${'```json'}\n${JSON.stringify(
          eps,
          null,
          2
        )}\n${'```'}`,
      },
    };
  },
  //'me-fetch-mangarawjp.io'
  async (env, interaction) => {
    const data = interaction?.data;
    const ops = data?.options as BaseOption[];
    if (!ops)
      return {
        type: msg,
        data: {
          content: 'no options',
        },
      };
    //check url serquence
    let [urlops, ifPushops] = ops;
    const url = urlops.value as string;
    const isValid = meUtils.checkUrl(url as unknown as string);
    if (!isValid)
      return {
        type: msg,
        data: {
          content: `url is invalid\nurl:'${url}'`,
        },
      };
    //create payload
    const id = interaction?.id;
    const token = interaction?.token;
    const guild_id = interaction?.guild_id || '0';
    const channel_id = interaction?.channel?.id || '0';
    if (!id || !token)
      return {
        type: msg,
        data: {
          content: 'id or token is empty',
        },
      };
    const ifPush =
      !ifPushops?.value || ifPushops.value === 'false' ? false : true;
    const pl: BC_GeneralPayload = {
      type: ifPush ? 'deferred-fetch-push' : 'deferred-fetch',
      eventInfo: {
        guild_id: guild_id,
        channel_id: channel_id,
        token: token,
        app_id: env.DISCORD_APPLICATION_ID,
      },
      data: {
        url: url,
      },
    };
    //check server
    if (!(await meUtils.checkMEserver(`${env.SERVER_URL}/version`))) {
      return down;
    }
    fetch(`${env.SERVER_URL}/badcompany`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pl),
    });
    //send defer
    return {
      type: deffer,
    };
  },
  //me-get
  async (env, interaction) => {
    if (!(await meUtils.checkMEserver(`${env.SERVER_URL}/version`))) {
      return down;
    }
    const options = interaction?.data?.options as BaseOption[];
    if (!options || options.length === 0) return err;
    const [titleops, epops] = options;
    const title = titleops.value as number;
    const ep = epops.value as string;
    const dir = await meUtils.getDir(env.SERVER_URL);
    if (dir.titles.length < title)
      return {
        type: msg,
        data: {
          content: 'タイトル指定が不適です',
        },
      };
    const eps = meUtils.trimedEpsByIndex(dir, title);
    const epIndex = eps.indexOf(ep);
    if (epIndex === -1)
      return {
        type: msg,
        data: {
          content: 'エピソード指定が不適です',
        },
      };
    const bc_state = await meUtils.getBCstate();
    const id = interaction?.id;
    const token = interaction?.token || '';
    const guild_id = interaction?.guild_id || '';
    const channel_id = interaction?.channel?.id || '';
    const pl: BC_GeneralPayload = {
      type: 'me-get',
      eventInfo: {
        guild_id: guild_id,
        channel_id: channel_id,
        token: token,
        app_id: env.DISCORD_APPLICATION_ID,
      },
      data: {
        title: title,
        ep: epIndex,
      },
    };
    if (
      bc_state.isProcessing === true &&
      bc_state.queue.filter((q) => q.type === 'me-get').length > 0
    ) {
      //処理中かつキューがある場合。
      pl.data.isdefer = false;
      meUtils.mePost(`${env.SERVER_URL}/badcompany/get`, pl);
      return {
        type: msg,
        data: {
          content: 'キューに追加されました。しばらくお待ちください。',
        },
      };
    }
    pl.data.isdefer = true;
    meUtils.mePost(`${env.SERVER_URL}/badcompany/get`, pl);
    return {
      type: deffer,
    };
  },
  //'defer-test'
  async (env, interaction) => {
    return {
      type: 5,
    };
  },
];

console.log('commandsActions.ts' + actions.length);

export const commandsWithAction: Command[] = commands.map((command, index) => ({
  entity: command,
  action: actions[index],
}));
