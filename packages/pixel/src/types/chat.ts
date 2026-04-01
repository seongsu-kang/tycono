/* =========================================================
   OFFICE CHAT — Types
   Slack-style channels for Role↔Role ambient conversations
   ========================================================= */

export interface ChatMessage {
  id: string;
  ts: number;
  /** Who sent this message */
  roleId: string;
  /** Message text */
  text: string;
  /** Message type */
  type: 'chat' | 'dispatch';
  /** Target channel for routing (chat messages) */
  channelId?: string;
  /** For social: the conversation partner */
  partnerId?: string;
  /** For dispatch: the target role */
  targetRoleId?: string;
}

export interface ChatChannel {
  id: string;          // 'general' | 'watercooler' | 'ch-xxx'
  name: string;        // '#office', '#engineering'
  members: string[];   // roleId[] — empty = all roles
  isDefault: boolean;  // #office = true, cannot delete
  messages: ChatMessage[];
  /** Channel topic/description — used as AI instruction for chat generation */
  topic?: string;
}
