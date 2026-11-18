---
name: concord-home
description: Navegação do Concord (v3, B7) — a barra de úteis (barra da esquerda com Início, Comunidade e o botão único "Ferramentas" que abre o hub com barra lateral por grupo e galeria), a Home (tela "Amigos" com abas e "Adicionar amigo", lista de conversas privadas com não lido e online, chat da conversa com @nome) e o item "Mensagem"/"Adicionar amigo" do botão direito numa pessoa. Use ao mexer em store/navigation.ts (section, homeView, toolId), lib/actions/navigation.ts (showHome, showCommunity, showFriends, openDmChat, messageAccount, openTool, showTools, showToolGallery, isChatOnScreen), components/rail/UtilityRail.tsx, components/home/HomeSidebar.tsx, components/friends/FriendsView.tsx, components/dm/DmList.tsx, components/tools/{registry,ToolView,ToolsSidebar,ToolGallery}, lib/dms.ts, lib/home.ts, no layout de App.tsx, nas barras laterais redimensionáveis (components/ResizableSide.tsx, lib/side-width.ts), ou ao investigar selo errado na Home, não lido que não some, conversa que não abre ou "Vocês precisam ser amigos para conversar".
---

A documentação desta área fica em **`docs/areas/home.md`**. Leia esse arquivo antes de mexer no código.

Esta skill existe só para te trazer até lá: nada de conteúdo aqui, para não haver duas versões da mesma regra.
