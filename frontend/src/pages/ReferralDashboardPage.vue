<template>
  <section class="mx-auto flex min-h-[70vh] w-full max-w-4xl flex-col px-4 sm:px-5 md:px-8 pb-12 sm:pb-16 md:pb-20 pt-20 sm:pt-24 md:pt-28">
    
    <!-- Modal de Chave PIX -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-all duration-200 ease-in"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div 
          v-if="showPixModal" 
          class="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <!-- Backdrop (clicável para fechar apenas se não for primeiro cadastro) -->
          <div 
            class="absolute inset-0 bg-black/70 backdrop-blur-sm"
            @click="!isFirstPixSetup && closePixModal()"
          ></div>
          
          <!-- Modal Content -->
          <div 
            class="relative z-10 rounded-xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-800 p-5 shadow-2xl transition-all duration-200"
            style="width: 340px; max-width: calc(100vw - 32px);"
          >
          <!-- Header -->
          <div class="flex items-center gap-2 mb-3">
            <div class="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 flex-shrink-0">
              <svg class="h-4 w-4 text-emerald-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.66 8.34l-2.83 2.83c-.39.39-1.02.39-1.41 0l-2.83-2.83c-.39-.39-.39-1.02 0-1.41l2.83-2.83c.39-.39 1.02-.39 1.41 0l2.83 2.83c.39.39.39 1.02 0 1.41z"/>
                <path d="M6.34 19.66l2.83-2.83c.39-.39 1.02-.39 1.41 0l2.83 2.83c.39.39.39 1.02 0 1.41l-2.83 2.83c-.39.39-1.02.39-1.41 0l-2.83-2.83c-.39-.39-.39-1.02 0-1.41z"/>
              </svg>
            </div>
            <div>
              <h2 class="text-sm font-bold text-white">{{ isFirstPixSetup ? 'Cadastre sua Chave PIX' : 'Editar Chave PIX' }}</h2>
              <p class="text-xs text-white/60">Para receber pagamentos</p>
            </div>
          </div>

          <!-- Aviso para primeiro cadastro -->
          <div v-if="isFirstPixSetup" class="mb-3 rounded-lg bg-amber-500/10 border border-amber-500/30 p-2">
            <p class="text-xs text-amber-200/90">
              <strong class="text-amber-300">Importante:</strong> Cadastre sua chave PIX para receber os pagamentos!
            </p>
          </div>

          <!-- Formulário -->
          <form @submit.prevent="savePixKey" class="space-y-3">
            <div>
              <input
                v-model="pixKeyInput"
                type="text"
                placeholder="Sua chave PIX"
                class="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/20 transition-all"
                :disabled="savingPix"
              />
              <p class="mt-1.5 text-[10px] text-white/50">
                CPF, CNPJ, E-mail, Telefone ou Chave Aleatória
              </p>
            </div>

            <!-- Erro -->
            <p v-if="pixError" class="text-xs text-rose-400">{{ pixError }}</p>

            <!-- Botões -->
            <div class="flex gap-2">
              <button
                v-if="!isFirstPixSetup"
                type="button"
                @click="closePixModal"
                class="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/80 transition-colors hover:bg-white/10"
                :disabled="savingPix"
              >
                Cancelar
              </button>
              <button
                type="submit"
                class="flex-1 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 px-3 py-2 text-xs font-bold text-white transition-all hover:from-emerald-600 hover:to-cyan-600 disabled:opacity-50"
                :disabled="savingPix || !pixKeyInput.trim()"
              >
                <span v-if="!savingPix">{{ isFirstPixSetup ? 'Cadastrar' : 'Salvar' }}</span>
                <span v-else>Salvando...</span>
              </button>
            </div>
          </form>
        </div>
      </div>
      </Transition>
    </Teleport>

    <!-- Estado de Carregamento -->
    <Card v-if="loading" class="w-full">
      <div class="flex flex-col items-center justify-center py-12 text-white">
        <div class="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-cyan-400"></div>
        <p class="mt-4 text-white/70">Carregando suas estatísticas...</p>
      </div>
    </Card>

    <!-- Estado de Erro / Não Autorizado -->
    <Card v-else-if="error" class="w-full">
      <div class="flex flex-col items-center justify-center py-12 text-white text-center">
        <div class="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/20 mb-4">
          <svg class="h-8 w-8 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 class="text-xl font-semibold mb-2">Acesso Negado</h2>
        <p class="text-white/70 mb-6">{{ error }}</p>
        <router-link to="/referral">
          <Button>Criar Meu Link de Indicação</Button>
        </router-link>
      </div>
    </Card>

    <!-- Dashboard Principal -->
    <div v-else-if="stats" class="space-y-6" v-motion :initial="{ opacity: 0, y: 30 }" :enter="{ opacity: 1, y: 0 }">
      <!-- Cabeçalho -->
      <Card class="w-full">
        <div class="text-white">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <p class="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.3em] sm:tracking-[0.4em] text-white/60 mb-1">Painel de Indicações</p>
              <h1 class="text-2xl sm:text-3xl font-bold">Olá, {{ referrer.nome }}!</h1>
            </div>
            <div class="flex items-start gap-4">
              <!-- Botão Chave PIX -->
              <button
                @click="openPixModal"
                class="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all"
                :class="referrer.pix_key 
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' 
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 animate-pulse'"
              >
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.66 8.34l-2.83 2.83c-.39.39-1.02.39-1.41 0l-2.83-2.83c-.39-.39-.39-1.02 0-1.41l2.83-2.83c.39-.39 1.02-.39 1.41 0l2.83 2.83c.39.39.39 1.02 0 1.41z"/>
                  <path d="M6.34 19.66l2.83-2.83c.39-.39 1.02-.39 1.41 0l2.83 2.83c.39.39.39 1.02 0 1.41l-2.83 2.83c-.39.39-1.02.39-1.41 0l-2.83-2.83c-.39-.39-.39-1.02 0-1.41z"/>
                </svg>
                <span class="hidden sm:inline">{{ referrer.pix_key ? 'Editar PIX' : 'Cadastrar PIX' }}</span>
                <span class="sm:hidden">PIX</span>
              </button>
              
              <!-- Info Membro -->
              <div class="flex-shrink-0 text-right">
                <p class="text-xs text-white/50">Membro desde</p>
                <p class="text-sm font-medium text-white/80">{{ formatDate(referrer.created_at) }}</p>
              </div>
            </div>
          </div>
          
          <!-- Link de Indicação -->
          <div class="rounded-xl border border-white/10 bg-white/5 p-4">
            <div class="flex items-center justify-between mb-2">
              <p class="text-sm text-white/70">Seu link de indicação:</p>
              <button 
                type="button" 
                class="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/20 px-3 py-1.5 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/30"
                @click="copyReferralLink"
              >
                <svg v-if="!copied" class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                <svg v-else class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                {{ copied ? 'Copiado!' : 'Copiar' }}
              </button>
            </div>
            <p class="break-all text-cyan-300 font-mono text-sm bg-black/20 rounded-lg p-3">
              {{ referralLink }}
            </p>
          </div>
        </div>
      </Card>

      <!-- Cards de Estatísticas -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card class="w-full">
          <div class="text-center text-white py-2">
            <div class="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-blue-500/20 mb-3">
              <svg class="h-6 w-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <p class="text-3xl font-bold">{{ stats.totalClicks }}</p>
            <p class="text-sm text-white/60 mt-1">Cliques no Link</p>
          </div>
        </Card>

        <Card class="w-full">
          <div class="text-center text-white py-2">
            <div class="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-purple-500/20 mb-3">
              <svg class="h-6 w-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <p class="text-3xl font-bold">{{ stats.totalReferrals }}</p>
            <p class="text-sm text-white/60 mt-1">Indicações</p>
          </div>
        </Card>

        <Card class="w-full">
          <div class="text-center text-white py-2">
            <div class="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-emerald-500/20 mb-3">
              <svg class="h-6 w-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p class="text-3xl font-bold">{{ stats.totalConverted }}</p>
            <p class="text-sm text-white/60 mt-1">Vendas</p>
          </div>
        </Card>

        <Card class="w-full">
          <div class="text-center text-white py-2">
            <div class="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-orange-500/20 mb-3">
              <svg class="h-6 w-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p class="text-3xl font-bold text-emerald-400">R$ {{ formatMoney(stats.totalEarnings || stats.earnings) }}</p>
            <p class="text-sm text-white/60 mt-1">Ganhos Totais</p>
          </div>
        </Card>
      </div>


      <!-- Resumo Financeiro -->
      <Card class="w-full">
        <div class="text-white">
          <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
            <svg class="h-5 w-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Seus Ganhos
          </h3>
          
          <!-- Cards de valores -->
          <div class="grid sm:grid-cols-3 gap-4 mb-4">
            <div class="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
              <p class="text-sm text-cyan-300/70 mb-1">Total a Receber</p>
              <p class="text-2xl font-bold text-cyan-400">R$ {{ formatMoney(stats.totalEarnings || 0) }}</p>
              <p class="text-xs text-white/50 mt-1">{{ stats.totalConverted || 0 }} venda(s)</p>
            </div>
            <div class="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <p class="text-sm text-emerald-300/70 mb-1">Disponível para Saque</p>
              <p class="text-2xl font-bold text-emerald-400">R$ {{ formatMoney(stats.availableEarnings || 0) }}</p>
              <p class="text-xs text-white/50 mt-1">Já liberado</p>
            </div>
            <div class="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <p class="text-sm text-amber-300/70 mb-1">Aguardando Liberação</p>
              <p class="text-2xl font-bold text-amber-400">R$ {{ formatMoney(stats.pendingEarnings || 0) }}</p>
              <p class="text-xs text-white/50 mt-1">Em processamento</p>
            </div>
          </div>

          <!-- Disclaimer sobre prazos de liberação -->
          <div class="p-4 rounded-xl bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-cyan-500/20">
            <div class="flex items-start gap-3">
              <div class="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500/20 flex-shrink-0">
                <svg class="h-4 w-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p class="font-semibold text-white mb-2">Prazos de Liberação</p>
                <div class="space-y-2 text-sm">
                  <div class="flex items-center gap-2">
                    <svg class="h-4 w-4 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                    <span class="text-white/80">
                      <strong class="text-white">Cartão de Crédito:</strong> 
                      <span class="text-cyan-400 font-medium">31 dias corridos</span> após a compra
                    </span>
                  </div>
                  <div class="flex items-center gap-2">
                    <svg class="h-4 w-4 text-emerald-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.66 8.34l-2.83 2.83c-.39.39-1.02.39-1.41 0l-2.83-2.83c-.39-.39-.39-1.02 0-1.41l2.83-2.83c.39-.39 1.02-.39 1.41 0l2.83 2.83c.39.39.39 1.02 0 1.41z"/>
                      <path d="M6.34 19.66l2.83-2.83c.39-.39 1.02-.39 1.41 0l2.83 2.83c.39.39.39 1.02 0 1.41l-2.83 2.83c-.39.39-1.02.39-1.41 0l-2.83-2.83c-.39-.39-.39-1.02 0-1.41z"/>
                    </svg>
                    <span class="text-white/80">
                      <strong class="text-white">PIX:</strong> 
                      <span class="text-cyan-400 font-medium">7 dias</span> após a compra
                    </span>
                  </div>
                </div>
                <p class="text-xs text-white/50 mt-3">
                  Você receberá R$ 60,00 por cada venda aprovada. Os pagamentos são realizados após o prazo de liberação.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <!-- Histórico de Transações (TODAS) -->
      <Card v-if="transactions && transactions.length > 0" class="w-full">
        <div class="text-white">
          <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
            <svg class="h-5 w-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            Histórico de Transações
          </h3>

          <!-- Legenda de Status -->
          <div class="flex flex-wrap gap-2 mb-4 text-xs">
            <span class="px-2 py-1 rounded bg-emerald-500/20 text-emerald-400">Aprovado</span>
            <span class="px-2 py-1 rounded bg-amber-500/20 text-amber-400">Aguardando</span>
            <span class="px-2 py-1 rounded bg-rose-500/20 text-rose-400">Cancelado/Expirado</span>
          </div>
          
          <div class="space-y-3">
            <div 
              v-for="tx in transactions" 
              :key="tx.id"
              class="p-4 rounded-xl bg-white/5 border border-white/10"
            >
              <!-- Linha principal -->
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="flex items-center gap-3">
                  <div class="flex h-10 w-10 items-center justify-center rounded-full text-white font-medium"
                    :class="getTransactionIconClass(tx)">
                    <!-- Ícone PIX -->
                    <svg v-if="tx.paymentMethod === 'pix'" class="h-5 w-5" :class="getTransactionIconColor(tx)" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.66 8.34l-2.83 2.83c-.39.39-1.02.39-1.41 0l-2.83-2.83c-.39-.39-.39-1.02 0-1.41l2.83-2.83c.39-.39 1.02-.39 1.41 0l2.83 2.83c.39.39.39 1.02 0 1.41z"/>
                      <path d="M6.34 19.66l2.83-2.83c.39-.39 1.02-.39 1.41 0l2.83 2.83c.39.39.39 1.02 0 1.41l-2.83 2.83c-.39.39-1.02.39-1.41 0l-2.83-2.83c-.39-.39-.39-1.02 0-1.41z"/>
                    </svg>
                    <!-- Ícone Cartão -->
                    <svg v-else class="h-5 w-5" :class="getTransactionIconColor(tx)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  </div>
                  <div>
                    <p class="font-medium">{{ tx.label || 'Cliente' }}</p>
                    <div class="flex items-center gap-2 mt-1">
                      <!-- Badge do método de pagamento -->
                      <span 
                        class="px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1"
                        :class="tx.paymentMethod === 'pix' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'"
                      >
                        <svg v-if="tx.paymentMethod === 'pix'" class="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.66 8.34l-2.83 2.83c-.39.39-1.02.39-1.41 0l-2.83-2.83c-.39-.39-.39-1.02 0-1.41l2.83-2.83c.39-.39 1.02-.39 1.41 0l2.83 2.83c.39.39.39 1.02 0 1.41z"/>
                        </svg>
                        <svg v-else class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                        </svg>
                        {{ tx.paymentMethod === 'pix' ? 'PIX' : 'Cartão' }}
                      </span>
                      <!-- Data -->
                      <span class="text-xs text-white/50">{{ formatDate(tx.createdAt) }}</span>
                    </div>
                  </div>
                </div>

                <div class="flex items-center gap-3 flex-wrap justify-end">
                  <!-- Status -->
                  <span 
                    class="px-3 py-1 rounded-full text-xs font-medium"
                    :class="getTransactionStatusClass(tx)"
                  >
                    {{ tx.statusLabel }}
                  </span>

                </div>
              </div>

              <!-- Detalhes extras para transações aprovadas -->
              <div v-if="tx.status === 'succeeded'" class="mt-3 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-sm">
                <div class="flex items-center gap-4">
                  <span class="text-white/50">Compra em: <span class="text-white">{{ formatDate(tx.createdAt) }}</span></span>
                  <span class="text-white/50">Liberação: 
                    <span :class="tx.isReleased ? 'text-emerald-400' : 'text-amber-400'">
                      {{ tx.isReleased ? 'Liberado ✓' : formatDate(tx.releaseDate) }}
                    </span>
                  </span>
                </div>
                <span class="font-bold text-emerald-400">+R$ {{ formatMoney(tx.amount) }}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <!-- Progresso para Otimização Grátis -->
      <Card class="w-full">
        <div class="text-white">
          <div class="flex items-center gap-3 mb-4">
            <div class="flex h-10 w-10 items-center justify-center rounded-full" :class="stats.freeOptimization ? 'bg-emerald-500/20' : 'bg-yellow-500/20'">
              <svg v-if="stats.freeOptimization" class="h-5 w-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              <svg v-else class="h-5 w-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 class="font-semibold text-lg">Otimização Gratuita</h3>
              <p v-if="stats.freeOptimization" class="text-sm text-emerald-400">🎉 Parabéns! Você desbloqueou!</p>
              <p v-else class="text-sm text-white/60">Faltam {{ stats.remainingForFree }} conversões para desbloquear</p>
            </div>
          </div>
          
          <!-- Barra de Progresso -->
          <div class="relative h-4 rounded-full bg-white/10 overflow-hidden">
            <div 
              class="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
              :class="stats.freeOptimization ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gradient-to-r from-yellow-500 to-orange-400'"
              :style="{ width: `${Math.min(100, (stats.totalConverted / 5) * 100)}%` }"
            ></div>
          </div>
          <p class="text-xs text-white/50 mt-2 text-right">{{ stats.totalConverted }}/5 conversões</p>
        </div>
      </Card>

      <!-- Lista de Indicações -->
      <Card class="w-full">
        <div class="text-white">
          <h3 class="text-xl font-semibold mb-4">Suas Indicações</h3>
          
          <div v-if="referrals.length === 0" class="text-center py-8">
            <div class="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-white/5 mb-4">
              <svg class="h-8 w-8 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <p class="text-white/60">Nenhuma indicação ainda.</p>
            <p class="text-sm text-white/40 mt-1">Compartilhe seu link para começar!</p>
          </div>

          <div v-else class="space-y-3">
            <div 
              v-for="referral in referrals" 
              :key="referral.id"
              class="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10"
            >
              <div class="flex items-center gap-3">
                <div class="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white font-medium">
                  {{ getInitials(referral.label || 'Indicação') }}
                </div>
                <div>
                  <p class="font-medium">{{ referral.label || 'Indicação' }}</p>
                  <p class="text-xs text-white/50">{{ formatDate(referral.data) }}</p>
                </div>
              </div>
              <span 
                class="px-3 py-1 rounded-full text-xs font-medium"
                :class="getStatusClass(referral.status)"
              >
                {{ referral.status }}
              </span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import Card from '../components/Card.vue'
import Button from '../components/Button.vue'
import api from '../utils/api'

const route = useRoute()

const loading = ref(true)
const error = ref(null)
const referrer = ref(null)
const stats = ref(null)
const referrals = ref([])
const sales = ref([])
const transactions = ref([])
const copied = ref(false)

// PIX Modal state
const showPixModal = ref(false)
const pixKeyInput = ref('')
const savingPix = ref(false)
const pixError = ref(null)
const isFirstPixSetup = computed(() => !referrer.value?.pix_key)

// Abrir modal de PIX
const openPixModal = () => {
  pixKeyInput.value = referrer.value?.pix_key || ''
  pixError.value = null
  showPixModal.value = true
}

// Fechar modal de PIX
const closePixModal = () => {
  if (!isFirstPixSetup.value) {
    showPixModal.value = false
    pixError.value = null
  }
}

// Salvar chave PIX
const savePixKey = async () => {
  if (!pixKeyInput.value.trim()) {
    pixError.value = 'Informe sua chave PIX'
    return
  }

  savingPix.value = true
  pixError.value = null

  try {
    const token = route.query.token
    await api.updatePixKey(token, pixKeyInput.value.trim())
    
    // Atualiza o referrer local
    referrer.value.pix_key = pixKeyInput.value.trim()
    showPixModal.value = false
  } catch (e) {
    console.error('[ReferralDashboard] Erro ao salvar PIX', e)
    pixError.value = e.message || 'Não foi possível salvar. Tente novamente.'
  } finally {
    savingPix.value = false
  }
}

// Mostrar modal automaticamente se não tiver PIX cadastrado
watch(referrer, (newReferrer) => {
  if (newReferrer && !newReferrer.pix_key) {
    // Delay pequeno para não abrir imediatamente (melhor UX)
    setTimeout(() => {
      showPixModal.value = true
    }, 500)
  }
}, { immediate: true })

// Construir o link de indicação
const referralLink = computed(() => {
  if (!referrer.value) return ''
  const baseUrl = window.location.origin
  return `${baseUrl}/?ref=${referrer.value.referral_code}`
})

// Copiar link de indicação
const copyReferralLink = async () => {
  if (!referralLink.value) return
  try {
    await navigator.clipboard.writeText(referralLink.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch (e) {
    // Falha silenciosa
  }
}

// Formatar data
const formatDate = (dateString) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

// Formatar valor monetário
const formatMoney = (value) => {
  if (typeof value !== 'number') return '0,00'
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// Obter iniciais do nome
const getInitials = (name) => {
  if (!name || typeof name !== 'string') return '--'
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase()
}

// Classes de status
const getStatusClass = (status) => {
  switch (status) {
    case 'Convertido':
      return 'bg-emerald-500/20 text-emerald-400'
    case 'Em contato':
      return 'bg-blue-500/20 text-blue-400'
    case 'Não converteu':
      return 'bg-rose-500/20 text-rose-400'
    default:
      return 'bg-white/10 text-white/60'
  }
}

// Classes para ícone da transação
const getTransactionIconClass = (tx) => {
  if (tx.status === 'succeeded') return 'bg-emerald-500/20'
  if (tx.status === 'canceled') return 'bg-rose-500/20'
  return 'bg-amber-500/20'
}

// Cor do ícone da transação
const getTransactionIconColor = (tx) => {
  if (tx.status === 'succeeded') return 'text-emerald-400'
  if (tx.status === 'canceled') return 'text-rose-400'
  return 'text-amber-400'
}

// Classes de status da transação
const getTransactionStatusClass = (tx) => {
  if (tx.status === 'succeeded') return 'bg-emerald-500/20 text-emerald-400'
  if (tx.status === 'canceled') return 'bg-rose-500/20 text-rose-400'
  return 'bg-amber-500/20 text-amber-400'
}

// Carregar estatísticas
onMounted(async () => {
  const token = route.query.token

  // Se não tem token, redireciona para criar link
  if (!token) {
    error.value = 'Link inválido. Por favor, acesse através do link correto do seu painel.'
    loading.value = false
    return
  }

  try {
    const response = await api.getReferralStats(token)
    referrer.value = response.data.referrer
    stats.value = response.data.stats
    referrals.value = response.data.referrals || []
    sales.value = response.data.sales || []
    transactions.value = response.data.transactions || []
  } catch (e) {
    console.error('[ReferralDashboard] Erro ao carregar stats', e)
    error.value = 'Este link é inválido ou expirou. Verifique se você está usando o link correto.'
  } finally {
    loading.value = false
  }
})
</script>
