#include "molan_av3a.h"

static molan_av3a* decoder;
static molan_av3a_frame_info info;
static int16_t pcm[MOLAN_AV3A_MAX_PCM_BYTES / 2];
static float stereo[MOLAN_AV3A_MAX_PCM_BYTES / 2];
static int pending;
static double position;

int spatial_init(void) {
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
  for (int i = 0; i < pending; ++i) {
    const int16_t* s = pcm + i * info.channels;
    float left = s[0];
    float right = info.channels == 1 ? left : s[1];
    // AVS3 channel beds: L R C LFE Ls Rs [Lb Rb] [top L/R pairs].
    // Fold the bed to stereo with headroom and leave the LFE to multichannel outputs.
    if (info.channels == 6 || info.channels == 8 || info.channels == 10 || info.channels == 12) {
      left += 0.70710678f * (s[2] + s[4]);
      right += 0.70710678f * (s[2] + s[5]);
      for (int ch = 6; ch < info.channels; ch += 2) {
        left += 0.5f * s[ch];
        right += 0.5f * s[ch + 1];
      }
      float headroom = 1.0f + 2.0f * 0.70710678f + 0.25f * (info.channels - 6);
      left /= headroom;
      right /= headroom;
    } else if (info.channels > 2) {
      return -1;
    }
    stereo[2 * i] = left / 32768.0f;
    stereo[2 * i + 1] = right / 32768.0f;
  }
  return 0;
}

int spatial_flush(void) { return 0; }
int spatial_read(void) {
  int frames = pending;
  pending = 0;
  return frames;
}
int spatial_rate(void) { return info.sample_rate; }
double spatial_position(void) { return position; }
const float* spatial_pcm(void) { return stereo; }
void spatial_close(void) { molan_av3a_free(decoder); }
