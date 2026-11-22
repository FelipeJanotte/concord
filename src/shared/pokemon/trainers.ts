export type Gender = 'male' | 'female'

export interface TrainerLook {
  id: string
  gender: Gender
}

export const TRAINER_LOOKS: TrainerLook[] = [
  { id: 'male-1', gender: 'male' },
  { id: 'male-2', gender: 'male' },
  { id: 'male-3', gender: 'male' },
  { id: 'male-4', gender: 'male' },
  { id: 'female-1', gender: 'female' },
  { id: 'female-2', gender: 'female' },
  { id: 'female-3', gender: 'female' },
  { id: 'female-4', gender: 'female' }
]

export const DEFAULT_LOOK = 'male-1'

export const isTrainerLook = (id: unknown): id is string => TRAINER_LOOKS.some((look) => look.id === id)
