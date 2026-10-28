# Criteo Inspector

Script para o Console do navegador que mostra, de forma legível, cada disparo do pixel da Criteo (OneTag) na página. Feito para facilitar a validação da implementação sem precisar decodificar URL na mão na aba Network.

![JavaScript puro](https://img.shields.io/badge/JavaScript-puro-f7df1e)
![Sem dependências](https://img.shields.io/badge/depend%C3%AAncias-nenhuma-188038)
![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-5f6368)

## O problema

Validar a Criteo pela aba Network é trabalhoso. Cada disparo é uma URL longa para `criteo.com/event`, com os eventos em `p0`, `p1`, `p2`..., valores codificados duas ou três vezes e produtos no formato `[i=..&pr=..&q=..,i=..]`. Para conferir se a compra mandou o ID do pedido, os preços e as quantidades certas, é preciso copiar a URL, decodificar e ler parâmetro por parâmetro.

O Criteo Inspector faz isso sozinho e já aponta o que está errado.

## O que ele faz

- **Lista cada disparo no Console**, com o evento principal, o total do carrinho e um selo de status (✓ ou alertas).
- **Decodifica tudo**: eventos, produtos, e-mail, device, cookies e parâmetros extras, em tabelas.
- **Faz um diagnóstico** de cada disparo (veja [Validações](#validações)).
- **Pega o que já disparou** antes de você colar o script e **continua monitorando** os novos (cliques, add to cart, navegação em SPA).
- **Detecta conversão duplicada**: avisa quando o mesmo Transaction ID aparece em mais de uma compra.
- **Confere o loader**: diz se o `ld.js` carregou e em qual conta, ou se existe `window.criteo_q` sem o loader.
- **Decodifica URLs avulsas**, por exemplo uma copiada da aba Network ou enviada por alguém.

## Como usar

### Uso rápido

1. Abra o site que quer validar.
2. Abra o DevTools (<kbd>F12</kbd>) e vá na aba **Console**.
3. Cole o conteúdo de [`criteo.js`](criteo.js) e aperte <kbd>Enter</kbd>.

> Na primeira vez, o Chrome pode bloquear a colagem e pedir que você digite `allow pasting`. É uma proteção do próprio navegador.

### Deixar salvo como Snippet (recomendado)

Assim o script fica disponível em qualquer site, sem colar de novo:

1. DevTools > **Sources** > **Snippets** > **+ New snippet**.
2. Cole o código e salve com <kbd>Ctrl</kbd> + <kbd>S</kbd>.
3. Em qualquer página, abra o snippet e rode com <kbd>Ctrl</kbd> + <kbd>Enter</kbd>.

Também dá para rodar pelo menu de comandos: <kbd>Ctrl</kbd> + <kbd>P</kbd>, digite `!` e o nome do snippet.

> O script vive só na aba atual. Ao recarregar a página ou navegar para outra (fora de SPA), é preciso rodar de novo. Os disparos que aconteceram no carregamento continuam sendo capturados, porque o script lê o histórico da página.

## Comandos

Depois de rodar, o objeto `criteoInspector` fica disponível no Console:

| Comando | O que faz |
| --- | --- |
| `criteoInspector.summary()` | Tabela com todos os disparos capturados: hora, evento, detalhe, conta, device, e-mail, página e status. |
| `criteoInspector.decode(url)` | Decodifica e diagnostica uma URL de evento. Aceita a URL completa, sem `https://` ou só a query string (`a=...&p0=...`). |
| `criteoInspector.hits` | Array com os dados de cada disparo. Ex.: `copy(criteoInspector.hits[0])` copia o primeiro para a área de transferência. |
| `criteoInspector.stop()` | Para de monitorar novos disparos. |

## O que aparece no Console

Cada disparo vira um grupo com uma linha de resumo, mais ou menos assim:

```
 CRITEO  #3 · 14:32:05   💰 Compra   ⚠ 1 alerta   pedido 98765 · 2 itens (3 un.) · R$ 459,70   conta 12345 · 🖥️ desktop · ✉️ e-mail ✓ · /checkout/sucesso
```

Disparos com alerta já abrem sozinhos. Os demais ficam fechados: clique na linha para ver o detalhe, organizado em seções:

| Seção | Conteúdo |
| --- | --- |
| 🩺 Diagnóstico | Erros, avisos e informações encontrados no disparo. |
| 🎯 Eventos enviados | Tabela com cada `p0`, `p1`... e um resumo do que foi enviado. |
| Detalhe do evento | Para listagem, produto, carrinho e compra: tabela de produtos com ID, preço, quantidade, subtotal e total. |
| 👤 Identificação e contexto | Device (`site_type`), hash de e-mail e outros dados de contexto. |
| 📡 Requisição | Conta, versão do OneTag, domínio, página, horário e duração. |
| 🍪 Cookies de terceiros | Conteúdo do parâmetro `sc`, quando existe. |
| 🔗 URL e payload bruto | A URL original e o valor bruto de cada evento, para comparar. |

## Eventos reconhecidos

| Código | Evento OneTag | Descrição |
| --- | --- | --- |
| `vh` | viewHome | Home |
| `vl` | viewList | Listagem |
| `vs` | viewSearch | Busca |
| `vp` | viewItem | Produto |
| `ac` | addToCart | Adição ao carrinho |
| `vb` | viewBasket | Carrinho |
| `vc` | trackTransaction | Compra |
| `vpg` | viewPage | Página genérica |
| `exd` | extraData | Contexto e device |
| `ce` | setEmail | E-mail (hash) |
| `id` | id | Identificador |
| `dis` | callDising | Dynamic Inventory Selection |
| `setData` | setData | Dados customizados |

Códigos fora dessa lista aparecem como "Evento não mapeado", com os campos decodificados do mesmo jeito.

## Validações

| Nível | Situação |
| --- | --- |
| ✖ Erro | Requisição sem Account ID (`a`). |
| ✖ Erro | Nenhum evento (`p0`, `p1`...) na requisição. |
| ✖ Erro | Compra (`trackTransaction`) sem Transaction ID. |
| ⚠ Aviso | `viewItem` sem ID de produto, ou `viewList` sem IDs. |
| ⚠ Aviso | Add to cart, carrinho ou compra sem produtos. |
| ⚠ Aviso | Item sem ID, com preço inválido ou negativo, ou com quantidade que não é inteiro positivo. |
| ⚠ Aviso | Preço com vírgula como separador decimal (a Criteo espera ponto). |
| ⚠ Aviso | Transaction ID repetido em outro disparo (possível conversão duplicada). |
| ℹ Info | Item com preço zero, disparo só de contexto, e-mail vazio (normal para visitante não identificado) e códigos não mapeados. |

## Configuração

No topo do arquivo há um objeto `CONFIG`:

```js
const CONFIG = {
  collapsed: true,        // disparos aparecem fechados
  expandOnWarning: true,  // os que têm alerta abrem sozinhos
  clearConsole: true,     // limpa o console ao iniciar
  currency: null,         // ex.: "BRL" para mostrar os valores como R$
  locale: "pt-BR",
};
```

Se o disparo trouxer a moeda (`currency`), ela tem prioridade sobre `CONFIG.currency`.

## Como funciona

O script não intercepta nem altera nenhuma requisição. Ele usa a [Resource Timing API](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Resource_timing) do navegador, que registra a URL de cada recurso carregado pela página:

1. Ao rodar, lê as entradas já registradas com `performance.getEntriesByType("resource")` e filtra as que vão para `criteo.com/event` e o loader `ld.js`.
2. Depois, um `PerformanceObserver` avisa cada vez que um recurso novo é carregado.
3. Cada URL de evento é decodificada (até três camadas de codificação), separada em eventos e produtos, diagnosticada e exibida no Console.

Por isso ele é seguro de usar em qualquer ambiente, inclusive produção:

- Não faz nenhuma requisição de rede.
- Não muda o comportamento do site nem da tag da Criteo.
- Não tem dependências. É um arquivo único de JavaScript puro.
- Rodar de novo encerra a instância anterior, então não duplica o monitoramento.

## Limitações

- **Só lê a URL.** Se algum disparo mandar dados no corpo de um POST, esse conteúdo não aparece.
- **Iframes.** Disparos feitos dentro de um iframe ficam no histórico do iframe, não da página principal. Para vê-los, troque o contexto do Console (seletor `top` no canto superior esquerdo) para o iframe e rode o script lá.
- **Páginas com muitos recursos.** O navegador guarda por padrão cerca de 250 entradas no histórico de recursos. Em páginas muito pesadas, disparos antigos podem já ter saído do histórico antes de você rodar o script. Os novos são capturados normalmente.
- **Recarregar a página apaga o script.** Use um Snippet para rodar de novo com um atalho.

## Licença

Distribuído sob a licença [MIT](LICENSE).
