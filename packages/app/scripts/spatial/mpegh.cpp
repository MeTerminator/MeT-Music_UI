#include <cstdint>
#include "mpeghdecoder.h"

namespace {
HANDLE_MPEGH_DECODER_CONTEXT decoder;
MPEGH_DECODER_OUTPUT_INFO info;
constexpr int bufferSize = 3072 * 12;
int32_t pcm[bufferSize];
float samples[bufferSize];
int channels;
}

extern "C" {
int spatial_init(int outputChannels) {
  int cicp;
  switch (outputChannels) {
    case 2: cicp = 2; break;
    case 6: cicp = 6; break;
    case 8: cicp = 12; break;
    case 12: cicp = 19; break;
    default: return -1;
  }
  channels = outputChannels;
  decoder = mpeghdecoder_init(cicp);
  return decoder ? 0 : -1;
}

int spatial_feed(const uint8_t* data, uint32_t size, double timestamp, uint32_t timescale) {
  return mpeghdecoder_processTimescale(decoder, data, size, uint64_t(timestamp), timescale);
}

int spatial_flush() { return mpeghdecoder_flushAndGet(decoder); }

int spatial_read() {
  const auto status = mpeghdecoder_getSamples(decoder, pcm, bufferSize, &info);
  if (status == MPEGH_DEC_FEED_DATA) return 0;
  if (status != MPEGH_DEC_OK || info.numChannels != channels) return -1;
  for (int i = 0; i < channels * info.numSamplesPerChannel; ++i)
    samples[i] = pcm[i] / 2147483648.0f;
  return info.numSamplesPerChannel;
}

int spatial_channels() { return info.numChannels; }
int spatial_rate() { return info.sampleRate; }
double spatial_position() { return double(info.ticks); }
const float* spatial_pcm() { return samples; }
void spatial_close() { mpeghdecoder_destroy(decoder); }
}
