import { z } from 'zod';

// --- User ---

export const userSchema = z.object({
  id: z.number().describe('User numeric ID'),
  first_name: z.string().describe('First name'),
  last_name: z.string().describe('Last name'),
  username: z.string().describe('Username (without @), empty if not set'),
  phone: z.string().describe('Phone number, empty if hidden'),
  is_bot: z.boolean().describe('Whether this is a bot account'),
  is_premium: z.boolean().describe('Whether the user has Telegram Premium'),
  status: z.string().describe('Online status (e.g., "online", "offline", "recently", "lastWeek")'),
});

export interface RawUser {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  usernames?: { username?: string }[];
  phone?: string;
  pFlags?: { bot?: boolean; premium?: boolean; self?: boolean };
  status?: { _?: string; was_online?: number };
}

export const mapUser = (u: RawUser) => ({
  id: u.id ?? 0,
  first_name: u.first_name ?? '',
  last_name: u.last_name ?? '',
  username: u.username ?? u.usernames?.[0]?.username ?? '',
  phone: u.phone ?? '',
  is_bot: u.pFlags?.bot ?? false,
  is_premium: u.pFlags?.premium ?? false,
  status: mapUserStatus(u.status),
});

const mapUserStatus = (status?: { _?: string; was_online?: number }): string => {
  if (!status?._) return 'unknown';
  switch (status._) {
    case 'userStatusOnline':
      return 'online';
    case 'userStatusOffline':
      return 'offline';
    case 'userStatusRecently':
      return 'recently';
    case 'userStatusLastWeek':
      return 'lastWeek';
    case 'userStatusLastMonth':
      return 'lastMonth';
    default:
      return status._.replace('userStatus', '').toLowerCase();
  }
};

// --- User Profile (full) ---

export const userProfileSchema = userSchema.extend({
  about: z.string().describe('Bio / about text'),
  common_chats_count: z.number().describe('Number of common groups with this user'),
});

export interface RawUserFull {
  full_user?: {
    about?: string;
    common_chats_count?: number;
  };
  users?: RawUser[];
}

export const mapUserProfile = (data: RawUserFull) => {
  const user = data.users?.[0];
  return {
    ...mapUser(user ?? {}),
    about: data.full_user?.about ?? '',
    common_chats_count: data.full_user?.common_chats_count ?? 0,
  };
};

// --- Message ---

export const messageSchema = z.object({
  id: z.number().describe('Message ID (unique within the chat)'),
  date: z.number().describe('Unix timestamp when the message was sent'),
  text: z.string().describe('Message text content'),
  from_id: z.number().describe('Sender user/chat ID'),
  peer_id: z.number().describe('Chat/peer ID where the message was sent'),
  is_outgoing: z.boolean().describe('Whether the message was sent by the current user'),
  reply_to_msg_id: z.number().describe('ID of the message this replies to, 0 if not a reply'),
  edit_date: z.number().describe('Unix timestamp of last edit, 0 if never edited'),
  is_pinned: z.boolean().describe('Whether the message is pinned'),
  type: z.string().describe('Message type: "message", "messageService", or "messageEmpty"'),
  views: z.number().describe('View count (channels only), 0 for private chats'),
});

export interface RawMessage {
  _?: string;
  id?: number;
  date?: number;
  message?: string;
  from_id?: { user_id?: number; channel_id?: number; chat_id?: number } | number;
  peer_id?: { user_id?: number; channel_id?: number; chat_id?: number };
  pFlags?: { out?: boolean; pinned?: boolean };
  reply_to?: { reply_to_msg_id?: number };
  edit_date?: number;
  views?: number;
  action?: { _?: string };
}

const extractPeerId = (peer?: { user_id?: number; channel_id?: number; chat_id?: number } | number): number => {
  if (typeof peer === 'number') return peer;
  if (!peer) return 0;
  return peer.user_id ?? peer.channel_id ?? peer.chat_id ?? 0;
};

export const mapMessage = (m: RawMessage) => ({
  id: m.id ?? 0,
  date: m.date ?? 0,
  text: m.message ?? (m.action ? `[${m.action._?.replace('messageAction', '') ?? 'action'}]` : ''),
  from_id: extractPeerId(m.from_id),
  peer_id: extractPeerId(m.peer_id),
  is_outgoing: m.pFlags?.out ?? false,
  reply_to_msg_id: m.reply_to?.reply_to_msg_id ?? 0,
  edit_date: m.edit_date ?? 0,
  is_pinned: m.pFlags?.pinned ?? false,
  type: m._?.replace('message', '').toLowerCase() === 'service' ? 'messageService' : (m._ ?? 'message'),
  views: m.views ?? 0,
});

// --- Dialog (conversation) ---

export const dialogSchema = z.object({
  peer_id: z.number().describe('Peer ID of the conversation'),
  peer_type: z.string().describe('Type: "user", "chat", or "channel"'),
  title: z.string().describe('Display name or title of the conversation'),
  unread_count: z.number().describe('Number of unread messages'),
  unread_mentions_count: z.number().describe('Number of unread mentions'),
  top_message_id: z.number().describe('ID of the most recent message'),
  top_message_text: z.string().describe('Text of the most recent message'),
  top_message_date: z.number().describe('Unix timestamp of the most recent message'),
  is_pinned: z.boolean().describe('Whether the conversation is pinned'),
  is_muted: z.boolean().describe('Whether notifications are muted'),
  folder_id: z.number().describe('Folder/filter ID (0 = main list)'),
});

export interface RawDialog {
  peer?: { _?: string; user_id?: number; channel_id?: number; chat_id?: number };
  unread_count?: number;
  unread_mentions_count?: number;
  top_message?: number;
  pFlags?: { pinned?: boolean };
  notify_settings?: { mute_until?: number };
  folder_id?: number;
}

export const mapDialog = (
  d: RawDialog,
  users: Map<number, RawUser>,
  chats: Map<number, RawChat>,
  messages: Map<number, RawMessage>,
) => {
  const peerId = extractPeerId(d.peer);
  const peerType = d.peer?._?.replace('peer', '').toLowerCase() ?? 'user';
  const topMsg = messages.get(d.top_message ?? 0);

  let title = '';
  if (peerType === 'user') {
    const user = users.get(peerId);
    title = user ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() : '';
  } else {
    const chat = chats.get(peerId);
    title = chat?.title ?? '';
  }

  return {
    peer_id: peerId,
    peer_type: peerType,
    title,
    unread_count: d.unread_count ?? 0,
    unread_mentions_count: d.unread_mentions_count ?? 0,
    top_message_id: d.top_message ?? 0,
    top_message_text: topMsg?.message ?? '',
    top_message_date: topMsg?.date ?? 0,
    is_pinned: d.pFlags?.pinned ?? false,
    is_muted: (d.notify_settings?.mute_until ?? 0) > 0,
    folder_id: d.folder_id ?? 0,
  };
};

// --- Chat / Channel ---

export const chatSchema = z.object({
  id: z.number().describe('Chat/channel numeric ID'),
  title: z.string().describe('Chat or channel title'),
  type: z.string().describe('Type: "chat", "channel", "chatForbidden", "channelForbidden"'),
  username: z.string().describe('Public username, empty if private'),
  participants_count: z.number().describe('Number of members (0 if unknown)'),
  about: z.string().describe('Description/about text'),
  is_megagroup: z.boolean().describe('Whether this is a supergroup (megagroup)'),
  is_broadcast: z.boolean().describe('Whether this is a broadcast channel'),
});

export interface RawChat {
  _?: string;
  id?: number;
  title?: string;
  username?: string;
  usernames?: { username?: string }[];
  participants_count?: number;
  pFlags?: { megagroup?: boolean; broadcast?: boolean };
}

export interface RawChatFull {
  full_chat?: {
    about?: string;
    participants_count?: number;
    participants?: { participants?: RawUser[] };
  };
  chats?: RawChat[];
  users?: RawUser[];
}

export const mapChat = (c: RawChat, about?: string) => ({
  id: c.id ?? 0,
  title: c.title ?? '',
  type: c._ ?? 'chat',
  username: c.username ?? c.usernames?.[0]?.username ?? '',
  participants_count: c.participants_count ?? 0,
  about: about ?? '',
  is_megagroup: c.pFlags?.megagroup ?? false,
  is_broadcast: c.pFlags?.broadcast ?? false,
});

// --- Contact ---

export const contactSchema = z.object({
  user_id: z.number().describe('Contact user ID'),
  mutual: z.boolean().describe('Whether the contact is mutual'),
});

export interface RawContact {
  user_id?: number;
  pFlags?: { mutual?: boolean };
}

export const mapContact = (c: RawContact) => ({
  user_id: c.user_id ?? 0,
  mutual: c.pFlags?.mutual ?? false,
});

// --- Helpers ---

/** Build a Map of users keyed by user ID */
export const buildUserMap = (users: RawUser[]): Map<number, RawUser> => {
  const map = new Map<number, RawUser>();
  for (const u of users) {
    if (u.id) map.set(u.id, u);
  }
  return map;
};

/** Build a Map of chats keyed by chat ID */
export const buildChatMap = (chats: RawChat[]): Map<number, RawChat> => {
  const map = new Map<number, RawChat>();
  for (const c of chats) {
    if (c.id) map.set(c.id, c);
  }
  return map;
};

/** Build a Map of messages keyed by message ID */
export const buildMessageMap = (messages: RawMessage[]): Map<number, RawMessage> => {
  const map = new Map<number, RawMessage>();
  for (const m of messages) {
    if (m.id) map.set(m.id, m);
  }
  return map;
};
