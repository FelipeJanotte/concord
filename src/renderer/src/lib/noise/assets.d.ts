// Import `arquivo?url` do Vite: devolve o endereço do arquivo empacotado no app (usado pelo motor de ruído).
declare module '*?url' {
  const url: string
  export default url
}
