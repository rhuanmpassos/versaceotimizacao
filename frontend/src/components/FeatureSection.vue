<template>
  <section
    :class="[
      'relative py-16 sm:py-20',
      borderTop ? 'border-t border-white/5' : '',
    ]"
  >
    <div class="mx-auto grid max-w-6xl items-center gap-10 px-5 sm:px-8 lg:grid-cols-2 lg:gap-16">
      <div
        :class="imageOrderClass"
        class="group relative flex items-center justify-center"
        v-motion
        :initial="{ opacity: 0, x: reverse ? 40 : -40 }"
        :enter="{ opacity: 1, x: 0, transition: { delay: 0.2 } }"
        style="will-change: transform, opacity;"
      >
        <div class="relative w-full overflow-hidden rounded-[28px] border border-white/10 bg-black/20 shadow-[0_20px_60px_rgba(0,0,0,0.55)]" style="aspect-ratio: 16/9; min-height: 300px;">
          <img 
            :src="image" 
            :alt="imageAlt" 
            class="absolute inset-0 h-full w-full object-cover" 
            loading="lazy"
            width="1200"
            height="675"
            decoding="async"
          />
          <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-black/40"></div>
        </div>
        <span class="pointer-events-none absolute -left-10 top-10 h-24 w-24 rounded-full bg-cyan-500/20 blur-3xl"></span>
        <span class="pointer-events-none absolute -bottom-8 right-0 h-28 w-28 rounded-full bg-orange-500/20 blur-3xl"></span>
      </div>
      <div
        :class="textOrderClass"
        v-motion
        :initial="{ opacity: 0, y: 30 }"
        :enter="{ opacity: 1, y: 0, transition: { delay: 0.1 } }"
        style="will-change: transform, opacity;"
      >
        <FeatureBlock :eyebrow="eyebrow" :title="title" :description="description" :items="items" />
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import FeatureBlock from './FeatureBlock.vue'

const props = defineProps({
  eyebrow: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  items: {
    type: Array,
    default: () => [],
  },
  image: {
    type: String,
    required: true,
  },
  imageAlt: {
    type: String,
    default: '',
  },
  reverse: {
    type: Boolean,
    default: false,
  },
  mobileTextFirst: {
    type: Boolean,
    default: false,
  },
  borderTop: {
    type: Boolean,
    default: true,
  },
})

const textOrderClass = computed(() => {
  const mobileOrder = props.mobileTextFirst ? 'order-1' : 'order-2'
  const desktopOrder = props.reverse ? 'lg:order-1' : 'lg:order-2'
  return `${mobileOrder} ${desktopOrder}`
})

const imageOrderClass = computed(() => {
  const mobileOrder = props.mobileTextFirst ? 'order-2' : 'order-1'
  const desktopOrder = props.reverse ? 'lg:order-2' : 'lg:order-1'
  return `${mobileOrder} ${desktopOrder}`
})
</script>

