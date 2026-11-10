#include "molan_av3a.h"

static molan_av3a* decoder;
static molan_av3a_frame_info info;
static int16_t pcm[MOLAN_AV3A_MAX_PCM_BYTES / 2];
static float samples[MOLAN_AV3A_MAX_PCM_BYTES / 2];
static int pending;
static double position;

int spatial_init(int output_channels) {
  decoder = molan_av3a_new();
  return decoder ? 0 : -1;
}

int spatial_feed(const uint8_t* data, uint32_t size, double timestamp, uint32_t timescale) {
  size_t consumed = 0;
  size_t bytes = 0;
  int status = molan_av3a_decode(decoder, data, size, pcm, sizeof(pcm), &consumed, &bytes);
  if (status != MOLAN_AV3A_OK || consumed != size || bytes == 0 ||
      molan_av3a_get_frame_info(decoder, &info) != MOLAN_AV3A_OK) return -1;

  position = timestamp * info.sample_rate / timescale;
  pending = info.frame_samples;
  if (pending <= 0 || info.channels <= 0 ||
      bytes != (size_t)pending * info.channels * sizeof(*pcm)) return -1;
  for (size_t i = 0; i < bytes / sizeof(*pcm); ++i)
    samples[i] = pcm[i] / 32768.0f;
  return 0;
}

int spatial_flush(void) { return 0; }
int spatial_read(void) {
  int frames = pending;
  pending = 0;
  return frames;
}
int spatial_channels(void) { return info.channels; }
int spatial_rate(void) { return info.sample_rate; }
double spatial_position(void) { return position; }
const float* spatial_pcm(void) { return samples; }
void spatial_close(void) { molan_av3a_free(decoder); }
