// Título de cada seção das Configurações (a janela tem um título só, invisível, para leitores de tela).
export function SettingsHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-lg font-semibold text-accent-foreground">{title}</h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  )
}
