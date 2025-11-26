<template>
  <section class="relative mx-auto flex min-h-[90vh] w-full max-w-6xl items-center px-5 pb-16 pt-28 sm:px-8 lg:pt-32">
    <div class="grid w-full gap-12 lg:grid-cols-[1.1fr_0.9fr]">
      <div class="relative flex flex-col justify-center text-center lg:text-left">
        <p
          class="text-sm font-semibold uppercase tracking-[0.4em] text-white/60"
          v-motion
          :initial="motionBase"
          :enter="{ ...motionEnter, transition: { delay: 0 } }"
        >
          Versace Otimização
        </p>
        <h1
          class="mt-6 text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl"
          v-motion
          :initial="motionBase"
          :enter="{ ...motionEnter, transition: { delay: 0.1 } }"
        >
          Otimize Seu PC Para o Máximo Desempenho
        </h1>
        <p
          class="mt-6 text-lg text-white/80 sm:text-xl"
          v-motion
          :initial="motionBase"
          :enter="{ ...motionEnter, transition: { delay: 0.2 } }"
        >
          Formatação, otimizações profissionais e ajustes avançados — tudo para deixar seu PC voando.
        </p>
        <div
          id="lead-form"
          class="mt-10 min-h-[200px]"
          v-motion
          :initial="motionBase"
          :enter="{ ...motionEnter, transition: { delay: 0.3 } }"
        >
          <FormLead />
        </div>
      </div>
      <div class="relative flex items-center justify-center lg:justify-end">
        <div
          class="relative w-full max-w-md rounded-[32px] border border-white/10 bg-gradient-to-br from-white/8 via-white/5 to-transparent p-8 text-white shadow-[0_20px_80px_rgba(0,0,0,0.5)] backdrop-blur-3xl min-h-[400px]"
          v-motion
          :initial="{ opacity: 0, scale: 0.9 }"
          :enter="{ opacity: 1, scale: 1, transition: { delay: 0.4, type: 'spring', damping: 18 } }"
          style="will-change: transform, opacity;"
        >
          <div class="absolute -top-6 right-10 text-sm uppercase tracking-[0.3em] text-white/50">100% Custom</div>
          <div class="space-y-6">
            <div class="flex items-center justify-between">
              <p class="text-lg font-semibold text-white/90">Performance Boost</p>
              <span class="text-emerald-300">+72%</span>
            </div>
            <div class="flex flex-col gap-4">
              <div v-for="(item, index) in optimizations" :key="item.label" class="space-y-1">
                <div class="flex items-center justify-between text-sm text-white/70">
                  <span>{{ item.label }}</span>
                  <span>{{ item.value }}%</span>
                </div>
                <div class="h-2 rounded-full bg-white/10">
                  <div
                    class="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
                    :style="{ width: item.value + '%' }"
                    :class="index === 0 ? 'shadow-[0_0_15px_rgba(34,211,238,0.5)]' : ''"
                  ></div>
                </div>
              </div>
            </div>
            <div class="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p class="text-sm text-white/70">Checklist</p>
              <ul class="mt-3 space-y-2 text-sm text-white/90">
                <li v-for="item in checklist" :key="item" class="flex items-center gap-2">
                  <span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300">✓</span>
                  {{ item }}
                </li>
              </ul>
            </div>
          </div>
          <span class="pointer-events-none absolute -right-8 bottom-10 h-20 w-20 rounded-full bg-cyan-500/30 blur-3xl"></span>
          <span class="pointer-events-none absolute -left-10 top-10 h-24 w-24 rounded-full bg-orange-500/20 blur-[70px]"></span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import FormLead from './FormLead.vue'

const motionBase = { opacity: 0, y: 20 }
const motionEnter = { opacity: 1, y: 0 }

const optimizations = [
  { label: 'Latência', value: 85 },
  { label: 'FPS Médio', value: 68 },
  { label: 'Estabilidade', value: 92 },
]

const checklist = ['Formatação limpa', 'Drivers atualizados', 'Políticas ajustadas']
</script>

