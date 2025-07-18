<template>
  <div class="dashboard-container">
    <admin-dashboard />
  </div>
</template>

<script>
import adminDashboard from './admin'

export default {
  name: 'Console',
  components: { adminDashboard }
}
</script>
