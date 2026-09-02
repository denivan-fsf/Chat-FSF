import { Router, type IRouter } from "express";
import {
  LoginBody,
  ListConversationsQueryParams,
  SendMessageBody,
  UpdateConversationBody,
} from "@workspace/api-zod";
import { createHmac, randomUUID } from "node:crypto";
import { broadcastRealtime } from "../lib/realtime";

type Role = "super_admin" | "manager" | "agent";
type ConversationStatus = "open" | "in_progress" | "waiting_customer" | "closed";

type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  initials: string;
  online: boolean;
};

type WhatsappNumber = {
  id: string;
  name: string;
  phoneNumber: string;
  status: "connected" | "disconnected";
  unreadCount: number;
  teamCount: number;
};

type Contact = {
  id: string;
  name: string;
  phoneNumber: string;
  profilePic: string | null;
  initials: string;
};

type Message = {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  content: string;
  mediaUrl: string | null;
  mediaType: string | null;
  sentByUser: User;
  status: "sent" | "delivered" | "read" | "pending" | "failed";
  createdAt: string;
};

type Conversation = {
  id: string;
  contact: Contact;
  whatsappNumber: WhatsappNumber;
  assignedUser: User;
  status: ConversationStatus;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
  tags: string[];
  activeViewer: string | null;
  activeViewerName: string | null;
  messages: Message[];
};

const users: User[] = [
  { id: "u-ana", name: "Ana Souza", email: "ana@atende.local", role: "agent", initials: "AS", online: true },
  { id: "u-rafael", name: "Rafael Lima", email: "rafael@atende.local", role: "manager", initials: "RL", online: true },
  { id: "u-marina", name: "Marina Costa", email: "marina@atende.local", role: "agent", initials: "MC", online: false },
  { id: "u-admin", name: "Paulo Mendes", email: "paulo@atende.local", role: "super_admin", initials: "PM", online: true },
];

const numbers: WhatsappNumber[] = [
  { id: "wa-1", name: "Comercial", phoneNumber: "+55 11 99876-1200", status: "connected", unreadCount: 7, teamCount: 4 },
  { id: "wa-2", name: "Suporte técnico", phoneNumber: "+55 11 99122-4810", status: "connected", unreadCount: 3, teamCount: 3 },
  { id: "wa-3", name: "Pós-venda", phoneNumber: "+55 11 98812-7701", status: "disconnected", unreadCount: 0, teamCount: 2 },
];

const now = Date.now();
const makeMessage = (
  id: string,
  conversationId: string,
  direction: "inbound" | "outbound",
  content: string,
  minutesAgo: number,
  sentByUser: User = users[0],
): Message => ({
  id,
  conversationId,
  direction,
  content,
  mediaUrl: null,
  mediaType: null,
  sentByUser: direction === "outbound" ? sentByUser : users[2],
  status: direction === "inbound" ? "read" : "delivered",
  createdAt: new Date(now - minutesAgo * 60_000).toISOString(),
});

const conversations: Conversation[] = [
  {
    id: "conv-1",
    contact: { id: "c-1", name: "Camila Oliveira", phoneNumber: "+55 11 98745-1020", profilePic: null, initials: "CO" },
    whatsappNumber: numbers[0],
    assignedUser: users[0],
    status: "in_progress",
    lastMessagePreview: "Perfeito, vou separar o seu pedido...",
    lastMessageAt: new Date(now - 2 * 60_000).toISOString(),
    unreadCount: 2,
    tags: ["Pedido #4821", "Prioridade"],
    activeViewer: "u-ana",
    activeViewerName: "Ana Souza",
    messages: [
      makeMessage("m-1", "conv-1", "inbound", "Oi! Gostaria de confirmar se o pedido #4821 já foi separado.", 22),
      makeMessage("m-2", "conv-1", "outbound", "Oi, Camila! Vou conferir para você agora. Só um instante.", 18, users[0]),
      makeMessage("m-3", "conv-1", "inbound", "Obrigada! Preciso dele para o evento de sábado.", 12),
      makeMessage("m-4", "conv-1", "outbound", "Perfeito, vou separar o seu pedido e te atualizo assim que estiver pronto.", 2, users[0]),
    ],
  },
  {
    id: "conv-2",
    contact: { id: "c-2", name: "João Ferreira", phoneNumber: "+55 11 97621-3304", profilePic: null, initials: "JF" },
    whatsappNumber: numbers[1],
    assignedUser: users[1],
    status: "open",
    lastMessagePreview: "Aparece uma mensagem de erro no pagamento.",
    lastMessageAt: new Date(now - 11 * 60_000).toISOString(),
    unreadCount: 1,
    tags: ["Checkout"],
    activeViewer: null,
    activeViewerName: null,
    messages: [
      makeMessage("m-5", "conv-2", "inbound", "Aparece uma mensagem de erro no pagamento.", 11),
    ],
  },
  {
    id: "conv-3",
    contact: { id: "c-3", name: "Beatriz Martins", phoneNumber: "+55 11 96804-7821", profilePic: null, initials: "BM" },
    whatsappNumber: numbers[0],
    assignedUser: users[0],
    status: "waiting_customer",
    lastMessagePreview: "Me avisa quando conseguir validar o endereço.",
    lastMessageAt: new Date(now - 37 * 60_000).toISOString(),
    unreadCount: 0,
    tags: ["Endereço"],
    activeViewer: null,
    activeViewerName: null,
    messages: [
      makeMessage("m-6", "conv-3", "inbound", "Posso trocar o endereço de entrega?", 48),
      makeMessage("m-7", "conv-3", "outbound", "Claro. Me avisa quando conseguir validar o endereço.", 37, users[0]),
    ],
  },
  {
    id: "conv-4",
    contact: { id: "c-4", name: "Lucas Andrade", phoneNumber: "+55 11 95518-4412", profilePic: null, initials: "LA" },
    whatsappNumber: numbers[1],
    assignedUser: users[2],
    status: "closed",
    lastMessagePreview: "Obrigado pelo atendimento, resolveu!",
    lastMessageAt: new Date(now - 3 * 60 * 60_000).toISOString(),
    unreadCount: 0,
    tags: ["Resolvido"],
    activeViewer: null,
    activeViewerName: null,
    messages: [
      makeMessage("m-8", "conv-4", "inbound", "Obrigado pelo atendimento, resolveu!", 180),
    ],
  },
  {
    id: "conv-5",
    contact: { id: "c-5", name: "Fernanda Reis", phoneNumber: "+55 11 94416-5510", profilePic: null, initials: "FR" },
    whatsappNumber: numbers[0],
    assignedUser: users[0],
    status: "open",
    lastMessagePreview: "Vocês entregam em Campinas?",
    lastMessageAt: new Date(now - 5 * 60 * 60_000).toISOString(),
    unreadCount: 4,
    tags: [],
    activeViewer: null,
    activeViewerName: null,
    messages: [
      makeMessage("m-9", "conv-5", "inbound", "Vocês entregam em Campinas?", 300),
    ],
  },
];

const tokenFor = (userId: string, kind: "access" | "refresh") =>
  createHmac("sha256", process.env.JWT_SECRET ?? "local-development-secret")
    .update(`${kind}:${userId}`)
    .digest("hex");

const currentUser = users[0];

const router: IRouter = Router();

router.get("/auth/session", (_req, res) => {
  res.json({ user: currentUser, accessToken: tokenFor(currentUser.id, "access"), refreshToken: tokenFor(currentUser.id, "refresh") });
});

router.post("/auth/login", (req, res) => {
  const result = LoginBody.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: "Informe e-mail e senha válidos." });
  const user = users.find((item) => item.email === result.data.email) ?? currentUser;
  return res.json({ user, accessToken: tokenFor(user.id, "access"), refreshToken: tokenFor(user.id, "refresh") });
});

router.get("/dashboard/summary", (_req, res) => {
  res.json({
    open: conversations.filter((item) => item.status === "open").length,
    inProgress: conversations.filter((item) => item.status === "in_progress").length,
    waitingCustomer: conversations.filter((item) => item.status === "waiting_customer").length,
    closedToday: conversations.filter((item) => item.status === "closed").length,
    responseTimeMinutes: 6.4,
    onlineAgents: users.filter((item) => item.online).length,
    totalAgents: users.length,
    connectedNumbers: numbers.filter((item) => item.status === "connected").length,
    totalNumbers: numbers.length,
  });
});

router.get("/whatsapp-numbers", (_req, res) => res.json(numbers));
router.get("/users", (_req, res) => res.json(users));

router.get("/conversations", (req, res) => {
  const parsed = ListConversationsQueryParams.safeParse(req.query);
  const filters = parsed.success ? parsed.data : {};
  const data = conversations
    .filter((item) => !filters.numberId || item.whatsappNumber.id === filters.numberId)
    .filter((item) => !filters.status || item.status === filters.status)
    .filter((item) => !filters.assignedUserId || item.assignedUser.id === filters.assignedUserId)
    .filter((item) => !filters.search || `${item.contact.name} ${item.contact.phoneNumber} ${item.lastMessagePreview}`.toLowerCase().includes(filters.search.toLowerCase()))
    .map(({ messages: _messages, ...conversation }) => conversation);
  res.json(data);
});

router.get("/conversations/:id", (req, res) => {
  const conversation = conversations.find((item) => item.id === req.params.id);
  if (!conversation) return res.status(404).json({ error: "Conversa não encontrada." });
  return res.json(conversation);
});

router.patch("/conversations/:id", (req, res) => {
  const parsed = UpdateConversationBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados de atualização inválidos." });
  const conversation = conversations.find((item) => item.id === req.params.id);
  if (!conversation) return res.status(404).json({ error: "Conversa não encontrada." });
  if (parsed.data.status) conversation.status = parsed.data.status;
  if (parsed.data.tags) conversation.tags = parsed.data.tags;
  if (parsed.data.assignedUserId !== undefined) {
    const assignee = users.find((item) => item.id === parsed.data.assignedUserId);
    if (assignee) conversation.assignedUser = assignee;
  }
  return res.json({ ...conversation, messages: undefined });
});

router.post("/conversations/:id/lock", (req, res) => {
  const conversation = conversations.find((item) => item.id === req.params.id);
  if (!conversation) return res.status(404).json({ error: "Conversa não encontrada." });
  const lockOwner = conversation.activeViewer && conversation.activeViewer !== currentUser.id
    ? users.find((item) => item.id === conversation.activeViewer)
    : currentUser;
  if (conversation.activeViewer && conversation.activeViewer !== currentUser.id) {
    return res.status(409).json({ error: `Conversa em atendimento por ${lockOwner?.name ?? "outro atendente"}.` });
  }
  conversation.activeViewer = currentUser.id;
  conversation.activeViewerName = currentUser.name;
  res.json({
    conversationId: conversation.id,
    lockedBy: currentUser,
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  });
  return;
});

router.get("/conversations/:id/messages", (req, res) => {
  const conversation = conversations.find((item) => item.id === req.params.id);
  if (!conversation) return res.status(404).json({ error: "Conversa não encontrada." });
  return res.json(conversation.messages);
});

router.post("/conversations/:id/messages", (req, res) => {
  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A mensagem não pode estar vazia." });
  const conversation = conversations.find((item) => item.id === req.params.id);
  if (!conversation) return res.status(404).json({ error: "Conversa não encontrada." });
  if (conversation.activeViewer && conversation.activeViewer !== currentUser.id) {
    return res.status(409).json({ error: "Esta conversa está bloqueada por outro atendente." });
  }
  const message: Message = {
    id: randomUUID(),
    conversationId: conversation.id,
    direction: "outbound",
    content: parsed.data.content,
    mediaUrl: parsed.data.mediaUrl ?? null,
    mediaType: parsed.data.mediaType ?? null,
    sentByUser: currentUser,
    status: "sent",
    createdAt: new Date().toISOString(),
  };
  conversation.messages.push(message);
  conversation.lastMessagePreview = message.content;
  conversation.lastMessageAt = message.createdAt;
  conversation.status = "in_progress";
  broadcastRealtime({ type: "message.created", conversationId: conversation.id, message });
  return res.status(201).json(message);
});

router.get("/webhooks/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === (process.env.WHATSAPP_VERIFY_TOKEN ?? "change-me")) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

router.post("/webhooks/whatsapp", (req, res) => {
  req.log.info({ object: req.body?.object }, "WhatsApp webhook received");
  res.json({ ok: true });
});

export default router;