#include "dtsx-ace.inc"

namespace {
constexpr int sampleRate = 48000;
constexpr int frameSamples = 1024;
constexpr int channelCount = 6;

std::unique_ptr<AceDecoder> decoder;
AcePacket packet;
float samples[frameSamples * channelCount];
double position;
bool ready;
}

extern "C" {
int spatial_init(int) {
    decoder = std::make_unique<AceDecoder>();
    return 0;
}

int spatial_feed(const std::uint8_t* data, std::uint32_t size, double timestamp,
                 std::uint32_t timescale) {
    ready = false;
    if (!decoder || size == 0 || timescale == 0) return -1;
    packet.bytes.assign(data, data + size);
    decoder->last_internal_ace_buses_.clear();
    const auto spectralFailures = decoder->internal_spectral_failures_;
    const auto synthesisFailures = decoder->internal_synthesis_failures_;
    try {
        const auto frame = decoder->parse_ace(packet);
        if (frame.sample_rate != sampleRate || frame.frame_duration != frameSamples
            || spectralFailures != decoder->internal_spectral_failures_
            || synthesisFailures != decoder->internal_synthesis_failures_) return -1;

        // DTS channel indices 0–4 are C/L/R/Ls/Rs. ACE carries LFE separately.
        std::array<const float*, 5> channels{};
        for (const auto& bus : decoder->last_internal_ace_buses_) {
            if (bus.pcm.size() > bus.routing_slots.size()) return -1;
            for (std::size_t channel = 0; channel < bus.pcm.size(); ++channel) {
                const auto slot = bus.routing_slots[channel];
                if (slot >= channels.size() || channels[slot] ||
                    bus.pcm[channel].size() != frameSamples) return -1;
                channels[slot] = bus.pcm[channel].data();
            }
        }
        if (std::any_of(channels.begin(), channels.end(), [](const float* ch) { return !ch; })
            || decoder->last_internal_lfe_pcm_.size() != 1
            || decoder->last_internal_lfe_pcm_[0].size() != frameSamples) return -1;

        // Standard 5.1 PCM order: L, R, C, LFE, Ls, Rs.
        const auto [center, left, right, surroundLeft, surroundRight] = channels;
        const std::array<const float*, channelCount> bed{
            left, right, center, decoder->last_internal_lfe_pcm_[0].data(),
            surroundLeft, surroundRight,
        };
        for (int i = 0; i < frameSamples; ++i) {
            for (int channel = 0; channel < channelCount; ++channel) {
                const float sample = bed[channel][i];
                if (!std::isfinite(sample)) return -1;
                samples[i * channelCount + channel] = sample;
            }
        }
    } catch (const std::exception&) {
        return -1;
    }
    position = timestamp * sampleRate / timescale;
    ready = true;
    return 0;
}

int spatial_flush() { return 0; }
int spatial_read() {
    if (!ready) return 0;
    ready = false;
    return frameSamples;
}
int spatial_channels() { return channelCount; }
int spatial_rate() { return sampleRate; }
double spatial_position() { return position; }
const float* spatial_pcm() { return samples; }
void spatial_close() { decoder.reset(); }
}
