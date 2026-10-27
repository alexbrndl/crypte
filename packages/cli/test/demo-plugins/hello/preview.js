// Les deux hooks de la section 6.2 sur le plus petit plugin : une marque posée
// après chaque rendu, que le cas navigateur compte, et une réponse au panneau.
let renders = 0

export default {
  afterMount: (ctx) => {
    renders += 1
    document.documentElement.dataset.helloRenders = String(renders)
    ctx.send({ type: 'hello:rendered', id: ctx.id, renders })
  },
  onMessage: (ctx, message) => {
    if (message.type === 'hello:ping') ctx.send({ type: 'hello:pong', id: ctx.id })
  },
}
