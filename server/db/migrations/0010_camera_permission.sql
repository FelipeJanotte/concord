-- B21: permissão de canal nova `video` (ligar a câmera). Comunidades que já existem ganham a câmera em
-- todo cargo que já podia compartilhar a tela (o @todos padrão incluso), como numa comunidade nova.
UPDATE "roles" SET "permissions" = array_append("permissions", 'video')
WHERE 'share' = ANY("permissions") AND NOT ('video' = ANY("permissions"));
