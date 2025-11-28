# Prompt para Dashboard de Analytics de Indicações

## Contexto do Projeto

Este é um sistema de programa de indicações onde:
- **Referrers** (pessoas que indicam) criam links únicos
- Visitantes clicam nos links e são rastreados
- Leads são gerados quando alguém se cadastra via link
- Conversões acontecem quando um lead compra o serviço

## ⚠️ Importante

- **Tecnologia:** JavaScript (não TypeScript)
- **Banco de dados:** Já está criado e populado com dados reais. **NÃO** é necessário criar tabelas ou migrations.
- **Objetivo:** Criar apenas o **dashboard frontend** que consome os dados existentes via APIs.

## Estrutura do Banco de Dados

### Tabela: `ReferralHit` (Cliques Rastreados)
Cada clique único (por IP) é registrado com os seguintes dados:

```typescript
{
  id: string (UUID)
  referral_code: string // Código do referrer (UUID ou slug)
  ip: string
  user_agent: string
  
  // Dados de Navegação
  referrer: string | null // Domínio de origem (ex: "google.com", "facebook.com")
  utm_source: string | null // Fonte da campanha
  utm_medium: string | null // Meio da campanha  
  utm_campaign: string | null // Nome da campanha
  
  // Dados de Dispositivo
  device_type: string | null // "mobile", "desktop", "tablet"
  os: string | null // "Windows", "macOS", "Android", "iOS", etc
  browser: string | null // "Chrome", "Firefox", "Safari", "Edge", etc
  screen_width: number | null // Largura da tela em pixels
  screen_height: number | null // Altura da tela em pixels
  
  // Localização (via IP)
  country: string | null // Código do país (ex: "BR", "US")
  city: string | null // Nome da cidade
  region: string | null // Região/Estado
  
  // Dados Técnicos
  language: string | null // Idioma do navegador (ex: "pt-BR")
  timezone: string | null // Timezone (ex: "America/Sao_Paulo")
  
  created_at: DateTime // Data/hora do clique
}
```

### Tabela: `Referrer` (Quem Indica)
```typescript
{
  id: string
  nome: string
  whatsapp: string
  referral_code: string (unique)
  access_token: string | null // Token para dashboard (só referrers normais)
  tipo: "NORMAL" | "INFLUENCER"
  ativo: boolean
  created_by: string | null // Email de quem criou (para logs/auditoria)
  created_at: DateTime
}
```

### Tabela: `Lead` (Indicações/Cadastros)
```typescript
{
  id: string
  nome: string
  whatsapp: string
  referral_code: string | null // Linkado ao Referrer
  ip: string | null // IP do lead (para segurança/anti-fraude)
  user_agent: string | null // User-Agent do navegador
  stage: "NA_BASE" | "EM_CONTATO" | "COMPRADO" | "REJEITADO"
  created_at: DateTime
}
```

## APIs Disponíveis

### 1. GET `/api/referral/stats?token={access_token}`
Retorna estatísticas de um referrer específico:
```json
{
  "referrer": {
    "nome": "João Silva",
    "referral_code": "abc123",
    "created_at": "2025-11-28T..."
  },
  "stats": {
    "totalClicks": 150,
    "totalReferrals": 25,
    "totalConverted": 8,
    "earnings": 480,
    "freeOptimization": false,
    "remainingForFree": 2
  },
  "referrals": [
    {
      "id": "...",
      "nome": "Maria",
      "status": "Convertido",
      "data": "2025-11-28T..."
    }
  ]
}
```

### 2. API de Cliques (Interna)
Os dados de cliques estão na tabela `ReferralHit`. Você precisará criar queries customizadas.

## Requisitos do Dashboard

### 1. Visão Geral (Overview)
**Cards principais:**
- Total de Cliques (todos os referrers ou filtrado)
- Total de Indicações (Leads gerados)
- Taxa de Conversão (% de leads que compraram)
- Total de Ganhos (R$ 60 por conversão)
- Cliques Únicos vs Total (se houver duplicatas)

### 2. Gráficos Principais

#### A. Cliques ao Longo do Tempo
- **Tipo:** Linha temporal
- **Eixo X:** Data/Hora (agrupado por dia, semana ou mês)
- **Eixo Y:** Quantidade de cliques
- **Filtros:** Por referrer, por país, por dispositivo, por período

#### B. Cliques por Dispositivo
- **Tipo:** Pizza ou Barras
- **Dados:** mobile, desktop, tablet
- **Mostrar:** Quantidade e percentual

#### C. Cliques por País
- **Tipo:** Mapa de calor ou Barras horizontais
- **Dados:** Top 10 países com mais cliques
- **Mostrar:** Quantidade e percentual

#### D. Cliques por Sistema Operacional
- **Tipo:** Barras
- **Dados:** Windows, macOS, Android, iOS, Linux, etc
- **Mostrar:** Quantidade

#### E. Cliques por Navegador
- **Tipo:** Barras ou Pizza
- **Dados:** Chrome, Firefox, Safari, Edge, etc
- **Mostrar:** Quantidade e percentual

#### F. Cliques por Referrer (Origem)
- **Tipo:** Barras horizontais
- **Dados:** Top sites de origem (google.com, facebook.com, direto, etc)
- **Mostrar:** Quantidade

#### G. Funnel de Conversão
- **Tipo:** Funil vertical
- **Etapas:**
  1. Cliques no Link
  2. Indicações (Leads gerados)
  3. Em Contato
  4. Convertidos (Comprados)
- **Mostrar:** Quantidade e taxa de conversão entre etapas

### 3. Tabela de Cliques Detalhada
**Colunas:**
- Data/Hora
- Referrer (nome ou código)
- IP (mascarado: xxx.xxx.xxx.xxx)
- País
- Cidade
- Dispositivo
- OS
- Navegador
- Referrer (origem)
- UTM Campaign (se houver)
- Resolução de Tela
- Timezone

**Funcionalidades:**
- Ordenação por qualquer coluna
- Busca/filtro por texto
- Filtros avançados:
  - Por referrer
  - Por país
  - Por dispositivo
  - Por período (data inicial/final)
  - Por OS
  - Por navegador
  - Por UTM campaign
- Paginação
- Exportar para CSV/Excel

### 4. Análise por Referrer
**Seção dedicada para cada referrer:**
- Cards com métricas individuais
- Gráficos específicos do referrer
- Timeline de cliques
- Taxa de conversão individual
- Comparação com média geral

### 5. Análise de Campanhas UTM
**Seção para campanhas:**
- Lista de campanhas ativas
- Performance por UTM Source
- Performance por UTM Medium
- Performance por UTM Campaign
- ROI de cada campanha

### 6. Filtros Globais
**Barra de filtros no topo:**
- Período (hoje, últimos 7 dias, últimos 30 dias, customizado)
- Referrer (dropdown com todos)
- País (multiselect)
- Dispositivo (multiselect: mobile, desktop, tablet)
- OS (multiselect)
- Navegador (multiselect)
- Status de conversão (todos, convertidos, não convertidos)

### 7. Exportação de Dados
**Botões de exportação:**
- Exportar cliques (CSV/Excel)
- Exportar estatísticas (PDF)
- Exportar relatório completo (PDF com gráficos)

## Design e UX

### Cores e Estilo
- Tema escuro (fundo: #050510)
- Cards com gradientes sutis e blur
- Cores de destaque: cyan, purple, emerald, orange
- Fonte: Space Grotesk ou similar

### Layout
- Dashboard responsivo (mobile-first)
- Grid de cards no topo
- Gráficos em grid 2x2 ou 3x3
- Tabela expansível
- Sidebar com navegação (opcional)

### Interatividade
- Gráficos interativos (hover para detalhes)
- Tooltips informativos
- Animações suaves
- Loading states
- Empty states (quando não há dados)

## Queries SQL/Prisma Necessárias

### Exemplos de queries que você precisará criar:

```typescript
// Total de cliques por dispositivo
SELECT device_type, COUNT(*) as total
FROM "ReferralHit"
WHERE referral_code = ?
GROUP BY device_type

// Cliques por país
SELECT country, COUNT(*) as total
FROM "ReferralHit"
WHERE referral_code = ?
GROUP BY country
ORDER BY total DESC
LIMIT 10

// Cliques ao longo do tempo (agrupado por dia)
SELECT DATE(created_at) as date, COUNT(*) as total
FROM "ReferralHit"
WHERE referral_code = ? AND created_at >= ? AND created_at <= ?
GROUP BY DATE(created_at)
ORDER BY date ASC

// Taxa de conversão
SELECT 
  COUNT(DISTINCT rh.id) as total_cliques,
  COUNT(DISTINCT l.id) as total_leads,
  COUNT(DISTINCT CASE WHEN l.stage = 'COMPRADO' THEN l.id END) as total_convertidos
FROM "ReferralHit" rh
LEFT JOIN "Lead" l ON l.referral_code = rh.referral_code
WHERE rh.referral_code = ?

// Top referrers (origem)
SELECT referrer, COUNT(*) as total
FROM "ReferralHit"
WHERE referral_code = ? AND referrer IS NOT NULL
GROUP BY referrer
ORDER BY total DESC
LIMIT 10
```

## Funcionalidades Avançadas (Opcional)

1. **Comparação de Períodos**
   - Comparar este mês vs mês anterior
   - Mostrar crescimento/queda percentual

2. **Alertas e Notificações**
   - Alertar quando houver pico de cliques
   - Notificar quando conversão cair abaixo da média

3. **Previsões**
   - Previsão de cliques para próximos dias (baseado em tendência)
   - Previsão de conversões

4. **Heatmap de Horários**
   - Mostrar em que horários há mais cliques
   - Gráfico de calor por dia da semana e hora

5. **Análise de Dispositivos Móveis**
   - Detalhes específicos de mobile (modelo, versão do OS)
   - Resoluções mais comuns

6. **Análise de Performance por Campanha**
   - ROI de cada UTM campaign
   - Custo por clique (se houver dados de gastos)
   - Taxa de conversão por campanha

## Tecnologias Recomendadas

- **Frontend:** React/Vue com biblioteca de gráficos (Chart.js, Recharts, ApexCharts)
- **Backend:** API REST ou GraphQL
- **Visualizações:** 
  - Chart.js ou Recharts para gráficos básicos
  - D3.js para visualizações avançadas
  - Leaflet ou similar para mapas
- **Tabelas:** React Table, AG Grid, ou similar
- **Exportação:** jsPDF para PDF, xlsx para Excel

## Segurança

- Autenticação obrigatória (JWT)
- Rate limiting nas APIs
- Validação de inputs
- Sanitização de dados
- Logs de acesso

## Performance

- Paginação obrigatória para tabelas grandes
- Lazy loading de gráficos
- Cache de queries frequentes
- Índices no banco para queries rápidas
- Agregações pré-calculadas (opcional, para grandes volumes)

---

**Nota:** Este dashboard deve ser acessível apenas para admins ou para referrers individuais (via access_token). Cada referrer deve ver apenas seus próprios dados, exceto no dashboard admin que vê tudo.

