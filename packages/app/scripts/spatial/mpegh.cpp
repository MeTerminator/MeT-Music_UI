#include <cstdint>
#include "mpeghdecoder.h"

namespace {
HANDLE_MPEGH_DECODER_CONTEXT decoder;
MPEGH_DECODER_OUTPUT_INFO info;
int32_t pcm[3072 * 2];
float stereo[3072 * 2];
}

extern "C" {
int spatial_init() {
  decoder = mpeghdecoder_init(2); // CICP 2: stereo rendering.
  return decoder ? 0 : -1;
}

int spatial_feed(const uint8_t* data, uint32_t size, double timestamp, uint32_t timescale) {
  return mpeghdecoder_processTimescale(decoder, data, size, uint64_t(timestamp), timescale);
}

int spatial_flush() { return mpeghdecoder_flushAndGet(decoder); }

int spatial_read() {
  const auto status = mpeghdecoder_getSamples(decoder, pcm, 3072 * 2, &info);
  if (status == MPEGH_DEC_FEED_DATA) return 0;
  if (status != MPEGH_DEC_OK || info.numChannels != 2) return -1;
  for (int i = 0; i < 2 * info.numSamplesPerChannel; ++i)
    stereo[i] = pcm[i] / 2147483648.0f;
  return info.numSamplesPerChannel;
}

int spatial_rate() { return info.sampleRate; }
double spatial_position() { return double(info.ticks); }
const float* spatial_pcm() { return stereo; }
void spatial_close() { mpeghdecoder_destroy(decoder); }
}
