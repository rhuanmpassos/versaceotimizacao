<template>
  <form class="flex w-full flex-col gap-4" @submit.prevent="submit">
    <div class="flex flex-col gap-4 md:flex-row">
      <Input
        v-model="form.nome"
        name="nome"
        placeholder="Nome"
        autocomplete="name"
        class="flex-1"
        v-motion
        :initial="motionBase"
        :enter="{ ...motionEnter, transition: { delay: 0.1 } }"
        style="will-change: transform, opacity;"
      />
      <Input
        v-model="form.whatsapp"
        name="whatsapp"
        placeholder="WhatsApp"
        autocomplete="tel"
        class="flex-1"
        v-motion
        :initial="motionBase"
        :enter="{ ...motionEnter, transition: { delay: 0.2 } }"
        style="will-change: transform, opacity;"
      />
    </div>
    <div class="min-h-[48px]">
      <Button
        type="submit"
        :disabled="loading"
        class="w-full md:w-auto"
        v-motion
        :initial="motionBase"
        :enter="{ ...motionEnter, transition: { delay: 0.3 } }"
        style="will-change: transform, opacity;"
      >
        <span v-if="!loading">Quero Otimizar Meu PC</span>
        <span v-else>Enviando...</span>
      </Button>
    </div>
    <div class="min-h-[24px]">
      <p v-if="success" class="text-sm text-emerald-300">Recebemos seus dados! Em breve entraremos em contato.</p>
      <p v-if="error" class="text-sm text-rose-300">{{ error }}</p>
    </div>
  </form>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue'
import Input from './Input.vue'
import Button from './Button.vue'
import api from '../utils/api'

const form = reactive({
  nome: '',
  whatsapp: '',
})

const loading = ref(false)
const success = ref(false)
const error = ref(null)
const referralCode = ref(null)

const motionBase = { opacity: 0, y: 20 }
const motionEnter = { opacity: 1, y: 0 }

onMounted(() => {
  const urlParams = new URLSearchParams(window.location.search)
  const refCode = urlParams.get('ref')
  if (refCode) {
    referralCode.value = refCode
    console.info('[FormLead] Referral code detectado:', refCode)
  }
})

const submit = async () => {
  if (!form.nome.trim() || !form.whatsapp.trim()) {
    error.value = 'Preencha nome e WhatsApp.'
    console.warn('[FormLead] Campos obrigatórios ausentes', { ...form })
    return
  }

  loading.value = true
  success.value = false
  error.value = null
  console.info('[FormLead] Enviando lead', { ...form, referral_code: referralCode.value })

  try {
    const payload = {
      nome: form.nome,
      whatsapp: form.whatsapp,
    }
    
    if (referralCode.value) {
      payload.referral_code = referralCode.value
    }

    await api.createLead(payload)
    console.info('[FormLead] Lead enviado com sucesso')
    success.value = true
    form.nome = ''
    form.whatsapp = ''
  } catch (e) {
    console.error('[FormLead] Falha ao enviar lead', e)
    error.value = e.message || 'Não foi possível enviar agora. Tente novamente.'
  } finally {
    loading.value = false
  }
}
</script>

