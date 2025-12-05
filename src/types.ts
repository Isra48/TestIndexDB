export type Participant = {
  id: string;
  name: string;
};

export type Gift = {
  id: string;
  category: string;
  prize: string;
};

export type RawGift = {
  category: string;
  prize: string;
  uds: number;
};

export type Winner = {
  id: string;
  participant: Participant;
  gift: Gift;
};
