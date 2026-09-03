export interface StoredCharacter {
  id: string;
  name: string;
  species: string;
  age: string;
  sex: string;
  appearance: string;
  personality: string;
  wardrobe: string;
  mustKeep: string;
  mustAvoid: string;
  notes: string;
  referenceImage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredVisualStyle {
  id: string;
  name: string;
  artStyle: string;
  lighting: string;
  palette: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}
