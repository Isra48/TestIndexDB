export type Participant = {
  id: string;
  name: string;
  employeeNumber?: string;
  email?: string;
};

export type Gift = {
  id: string;
  category: string;
  prize: string;
  cost?: string;
};

export type Winner = {
  id: string;
  participant: Participant;
  gift: Gift;
};
