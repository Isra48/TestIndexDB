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
  unit?: string;
  cost?: number;
};

export type Winner = {
  id: string;
  participant: Participant;
  gift: Gift;
};
