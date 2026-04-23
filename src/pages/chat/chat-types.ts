export type ChatMode = "single" | "group";

export type Account = {
  id: string;
  name: string;
  operator: string;
  description: string;
  phone: string;
  metrics: {
    totalCustomers: number;
    activeCustomers: number;
    agents: number;
    stores: number;
  };
  tone: string;
};

export type Conversation = {
  id: string;
  accountId: string;
  customerId: string;
  customerName: string;
  preview: string;
  updatedAt: string;
  quietFor: string;
  unread: number;
  mode: ChatMode;
  status: "claimed" | "public" | "follow-up";
  priority: "high" | "medium" | "low";
};

export type Message = {
  id: string;
  conversationId: string;
  role: "customer" | "agent" | "system";
  author: string;
  body: string;
  sentAt: string;
  status: "sending" | "sent" | "failed" | "read";
};

export type CustomerProfile = {
  id: string;
  name: string;
  persona: string;
  city: string;
  phone: string;
  stage: string;
  intentScore: number;
  tags: string[];
  metrics: Array<{
    label: string;
    value: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: "open" | "due" | "done";
  }>;
  notes: string[];
};
