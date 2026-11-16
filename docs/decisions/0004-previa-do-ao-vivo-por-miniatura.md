# 0004 — Prévia do "ao vivo" por miniatura enviada pelo socket

- **Data:** 2026-11-15
- **Situação:** aceita

## Contexto
Quem está fora da sala quer ver o que alguém está compartilhando ao passar o mouse no "Ao vivo", sem entrar na
sala. A tela só existe no LiveKit, e ver uma faixa lá exige uma conexão (token) na sala.

## Decisão
Quem compartilha tira uma miniatura JPEG (até 480 px, 1 a cada 5 s) e manda pelo Socket.IO (`voice:preview`); o
servidor guarda só a última em memória e entrega em `voice:preview-get` para quem tem `view` + `connect` na sala.

## Alternativas descartadas
| Opção | Por que não |
|---|---|
| Conexão LiveKit escondida (token só de assinatura, `hidden`) ao passar o mouse | 1–2 s para conectar a cada hover, segunda `Room` no `VoiceClient` (hoje uma só), banda de vídeo de verdade para cada curioso e quem é observado não fica sabendo |
| Miniatura por `POST` HTTP e arquivo no `FileStorage` | disco e limpeza para um dado que só vale 5 s; o socket já tem quem é a conexão e o estado `sharing` |
| Servidor empurra a miniatura para todos que veem a sala | manda imagem para quem nunca passou o mouse; puxar sob demanda gasta só quando alguém olha |

## Consequências
Barato e sem mexer no LiveKit; a prévia atrasa até 5 s e não tem áudio. Trocar para vídeo ao vivo depois exige um
token novo de só assistir e uma segunda conexão no app. As miniaturas somem ao reiniciar o servidor (o app manda de
novo em 5 s).
