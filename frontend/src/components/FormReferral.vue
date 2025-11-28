<template>
  <form class="flex flex-col gap-5" @submit.prevent="submit">
    <Input v-model="form.nome" name="ref-nome" placeholder="Nome" autocomplete="name" />
    <Input v-model="form.whatsapp" name="ref-whatsapp" placeholder="WhatsApp" autocomplete="tel" />
    <Button type="submit" :disabled="loading">
      <span v-if="!loading">Gerar Link de Indicação</span>
      <span v-else>Gerando...</span>
    </Button>
    <p v-if="error" class="text-sm text-rose-300">{{ error }}</p>
  </form>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import Input from './Input.vue'
import Button from './Button.vue'
import api from '../utils/api'

const router = useRouter()

const form = reactive({
  nome: '',
  whatsapp: '',
})

const loading = ref(false)
const error = ref(null)

const submit = async () => {
  if (!form.nome.trim() || !form.whatsapp.trim()) {
    error.value = 'Informe nome e WhatsApp para gerar seu link.'
    console.warn('[FormReferral] Campos obrigatórios ausentes', { ...form })
    return
  }

  loading.value = true
  error.value = null
  console.info('[FormReferral] Gerando referral', { ...form })

  try {
    const response = await api.createReferrer({
      nome: form.nome,
      whatsapp: form.whatsapp,
    })
    const accessToken = response.data?.access_token ?? ''
    console.info('[FormReferral] Link gerado, redirecionando para dashboard', { 
      accessToken,
    })
    
    // Redireciona para o dashboard após criar o referrer
    router.push({
      path: '/referral/dashboard',
      query: { token: accessToken },
    })
  } catch (e) {
    console.error('[FormReferral] Falha ao gerar link', e)
    error.value = e.message || 'Não foi possível gerar agora. Tente mais tarde.'
    loading.value = false
  }
}

</script>

