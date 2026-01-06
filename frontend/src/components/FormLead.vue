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
      <div
        class="flex-1"
        v-motion
        :initial="motionBase"
        :enter="{ ...motionEnter, transition: { delay: 0.2 } }"
        style="will-change: transform, opacity;"
      >
        <PhoneInput
          v-model="form.whatsapp"
          name="whatsapp"
          placeholder="WhatsApp"
          autocomplete="tel"
        />
      </div>
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
        <span v-if="!loading">Marcar Otimização</span>
        <span v-else>Processando...</span>
      </Button>
    </div>
    <div class="min-h-[24px]">
      <p v-if="error" class="text-sm text-rose-300">{{ error }}</p>
    </div>
  </form>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Input from './Input.vue'
import Button from './Button.vue'
import PhoneInput from './PhoneInput.vue'
import api from '../utils/api'
import { getTrackingId } from '../utils/tracking'

const router = useRouter()

const form = reactive({
  nome: '',
  whatsapp: '',
})

const loading = ref(false)
const error = ref(null)
const referralCode = ref(null)

const motionBase = { opacity: 0, y: 20 }
const motionEnter = { opacity: 1, y: 0 }

onMounted(() => {
  const urlParams = new URLSearchParams(window.location.search)
  let refCode = urlParams.get('ref')
  
  if (refCode) {
    // Limpa o ref caso o usuário tenha usado ? em vez de & na URL
    // Ex: ?ref=opplex?utm_source=... → pega só "opplex"
    if (refCode.includes('?')) {
      refCode = refCode.split('?')[0]
      console.warn('[FormLead] URL malformada detectada, ref limpo para:', refCode)
    }
    
    // Só aceita se for válido (alfanumérico, hífen, underscore)
    if (refCode && /^[a-zA-Z0-9_-]+$/.test(refCode)) {
      referralCode.value = refCode
      console.info('[FormLead] Referral code detectado:', refCode)
    } else {
      console.warn('[FormLead] Referral code inválido ignorado:', refCode)
    }
  }
})

const submit = async () => {
  if (!form.nome.trim() || !form.whatsapp.trim()) {
    error.value = 'Preencha nome e WhatsApp.'
    console.warn('[FormLead] Campos obrigatórios ausentes', { ...form })
    return
  }

  loading.value = true
  error.value = null
  console.info('[FormLead] Enviando lead', { ...form, referral_code: referralCode.value })

  try {
    const payload = {
      nome: form.nome,
      whatsapp: form.whatsapp,
      tracking_id: getTrackingId(), // Cookie ID para correlação
    }
    
    if (referralCode.value) {
      payload.referral_code = referralCode.value
    }

    const response = await api.createLead(payload)
    console.info('[FormLead] Lead enviado com sucesso', response.data)
    
    // Salvar lead_id no localStorage para uso no agendamento
    if (response.data.lead_id) {
      localStorage.setItem('lead_id', response.data.lead_id)
      localStorage.setItem('lead_name', response.data.lead_name || form.nome)
    }
    
    // Redirecionar para a página de agendamento
    router.push({
      name: 'scheduling',
      query: {
        lead: response.data.lead_id,
        name: encodeURIComponent(form.nome),
      },
    })
  } catch (e) {
    console.error('[FormLead] Falha ao enviar lead', e)
    error.value = e.message || 'Não foi possível enviar agora. Tente novamente.'
    loading.value = false
  }
}
</script>

