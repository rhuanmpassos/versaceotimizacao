<template>
  <GradientBackground />
  <div class="relative flex min-h-screen flex-col text-white">
    <Navbar />
    <main class="flex-1">
      <component :is="isReferralRoute ? ReferralPage : LandingPage" />
    </main>
    <Footer />
  </div>
  <Analytics />
</template>

<script setup>
import { onMounted } from 'vue'
import { Analytics } from '@vercel/analytics/vue'
import LandingPage from './pages/LandingPage.vue'
import ReferralPage from './pages/ReferralPage.vue'
import GradientBackground from './components/GradientBackground.vue'
import Navbar from './components/Navbar.vue'
import Footer from './components/Footer.vue'
import api from './utils/api'

const isReferralRoute = window.location.pathname.startsWith('/referral')

onMounted(() => {
  const urlParams = new URLSearchParams(window.location.search)
  const refCode = urlParams.get('ref')

  if (refCode) {
    api.trackReferral({ referral_code: refCode })
  }
})
</script>
