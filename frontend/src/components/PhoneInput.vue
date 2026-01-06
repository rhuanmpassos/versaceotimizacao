<template>
  <div class="flex gap-2 w-full" ref="containerRef">
    <!-- Country Selector Button -->
    <button
      ref="buttonRef"
      type="button"
      @click="toggleDropdown"
      class="flex items-center gap-1.5 h-full px-3 py-2.5 sm:py-3 rounded-lg sm:rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] text-white transition-all duration-300 hover:from-white/10 hover:to-white/[0.05] focus:border-cyan-400/60 focus:outline-none focus:ring-1 focus:ring-cyan-400/30"
      :class="{ 'border-cyan-400/60 ring-1 ring-cyan-400/30': isOpen }"
    >
      <span class="text-lg leading-none">{{ selectedCountry.flag }}</span>
      <span class="text-sm text-white/70">+{{ selectedCountry.code }}</span>
      <svg
        class="w-3 h-3 text-white/50 transition-transform duration-200"
        :class="{ 'rotate-180': isOpen }"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- Phone Input -->
    <div class="group relative flex-1">
      <div class="absolute -inset-px rounded-lg sm:rounded-xl bg-gradient-to-r from-cyan-500/0 via-blue-500/0 to-indigo-500/0 opacity-0 transition-all duration-300 group-focus-within:from-cyan-500/50 group-focus-within:via-blue-500/50 group-focus-within:to-indigo-500/50 group-focus-within:opacity-100 blur-[2px]"></div>
      <input
        class="relative w-full rounded-lg sm:rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base text-white placeholder:text-white/40 transition-all duration-300 focus:border-cyan-400/60 focus:bg-gradient-to-br focus:from-white/10 focus:to-white/[0.05] focus:outline-none focus:ring-1 focus:ring-cyan-400/30"
        type="tel"
        :value="phoneNumber"
        :placeholder="placeholder"
        v-bind="$attrs"
        @input="handleInput"
      />
    </div>

    <!-- Dropdown Portal - renders at body level -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
        <div
          v-if="isOpen"
          ref="dropdownRef"
          class="fixed w-64 max-h-72 overflow-hidden rounded-xl border border-white/20 bg-slate-900/98 backdrop-blur-2xl shadow-2xl"
          :style="dropdownStyle"
        >
          <!-- Search -->
          <div class="p-3 border-b border-white/10">
            <div class="relative">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref="searchInput"
                v-model="searchQuery"
                type="text"
                placeholder="Buscar país..."
                class="w-full pl-10 pr-3 py-2 text-sm rounded-lg border border-white/10 bg-white/5 text-white placeholder:text-white/40 focus:border-cyan-400/60 focus:outline-none focus:ring-1 focus:ring-cyan-400/30"
                @keydown.esc="closeDropdown"
              />
            </div>
          </div>

          <!-- Country List -->
          <div class="overflow-y-auto max-h-52 py-1">
            <button
              v-for="country in filteredCountries"
              :key="country.code"
              type="button"
              @click="selectCountry(country)"
              class="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/10"
              :class="country.code === selectedCountry.code ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/80'"
            >
              <span class="text-xl leading-none">{{ country.flag }}</span>
              <span class="flex-1 text-sm font-medium">{{ country.name }}</span>
              <span class="text-xs text-white/50 font-mono">+{{ country.code }}</span>
            </button>
            <div v-if="filteredCountries.length === 0" class="px-4 py-3 text-sm text-white/40 text-center">
              Nenhum país encontrado
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { getCountriesWithPriority, findCountryByCode, defaultCountry } from '../data/countries'

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  placeholder: {
    type: String,
    default: 'WhatsApp',
  },
})

const emit = defineEmits(['update:modelValue'])

// Get countries with priority ordering
const countries = getCountriesWithPriority()

const isOpen = ref(false)
const searchQuery = ref('')
const selectedCountry = ref(defaultCountry)
const phoneNumber = ref('')
const buttonRef = ref(null)
const dropdownRef = ref(null)
const searchInput = ref(null)
const containerRef = ref(null)

// Dropdown position
const dropdownStyle = ref({})

const updateDropdownPosition = () => {
  if (!buttonRef.value) return
  const rect = buttonRef.value.getBoundingClientRect()
  dropdownStyle.value = {
    top: `${rect.bottom + 8}px`,
    left: `${rect.left}px`,
    zIndex: 9999,
  }
}

// Filter countries by search query
const filteredCountries = computed(() => {
  if (!searchQuery.value) return countries
  const query = searchQuery.value.toLowerCase()
  return countries.filter(
    (c) =>
      c.name.toLowerCase().includes(query) ||
      c.code.includes(query)
  )
})

// Toggle dropdown
const toggleDropdown = () => {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    updateDropdownPosition()
    nextTick(() => {
      searchInput.value?.focus()
    })
  }
}

const closeDropdown = () => {
  isOpen.value = false
  searchQuery.value = ''
}

// Select country
const selectCountry = (country) => {
  selectedCountry.value = country
  closeDropdown()
  emitValue()
}

// Handle phone input
const handleInput = (event) => {
  const digits = event.target.value.replace(/\D/g, '')
  phoneNumber.value = digits
  emitValue()
}

// Emit combined value
const emitValue = () => {
  if (phoneNumber.value) {
    emit('update:modelValue', selectedCountry.value.code + phoneNumber.value)
  } else {
    emit('update:modelValue', '')
  }
}

// Parse initial value
const parseValue = (value) => {
  if (!value) {
    phoneNumber.value = ''
    return
  }
  
  const digits = value.replace(/\D/g, '')
  
  // Sort countries by code length (longest first) to avoid false matches
  // e.g., +1 should not match +1242 (Bahamas)
  const sortedCountries = [...countries].sort((a, b) => b.code.length - a.code.length)
  
  // Try to detect country from value
  for (const country of sortedCountries) {
    if (digits.startsWith(country.code)) {
      selectedCountry.value = country
      phoneNumber.value = digits.slice(country.code.length)
      return
    }
  }
  
  phoneNumber.value = digits
}

watch(() => props.modelValue, parseValue, { immediate: true })

// Click outside to close
const handleClickOutside = (event) => {
  if (
    buttonRef.value && !buttonRef.value.contains(event.target) &&
    dropdownRef.value && !dropdownRef.value.contains(event.target)
  ) {
    closeDropdown()
  }
}

// Update position on scroll/resize
const handleScrollResize = () => {
  if (isOpen.value) {
    updateDropdownPosition()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  window.addEventListener('scroll', handleScrollResize, true)
  window.addEventListener('resize', handleScrollResize)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('scroll', handleScrollResize, true)
  window.removeEventListener('resize', handleScrollResize)
})
</script>
