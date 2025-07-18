<template>
  <div class="landing-container">
    <p>正在根据您的权限跳转，请稍候...</p>
  </div>
</template>

<script>
import { mapGetters } from 'vuex'

export default {
  name: 'LandingPage',
  computed: {
    ...mapGetters([
      'roles'
    ])
  },
  created() {
    if (this.roles.includes('approver')) {
      this.$router.replace({ path: '/recycle/production' })
    } else {
      this.$router.replace({ path: '/console' })
    }
  }
}
</script>

<style scoped>
.landing-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  font-size: 1.2rem;
  color: #666;
}
</style>
