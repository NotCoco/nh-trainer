import java.io.ByteArrayOutputStream;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import net.runelite.cache.definitions.loaders.sound.SoundEffectTrackLoader;
import net.runelite.cache.definitions.sound.InstrumentDefinition;
import net.runelite.cache.definitions.sound.SoundEffectTrackDefinition;

public final class SoundEffectWavExporter
{
	private static final int SAMPLE_RATE = 22050;
	private static final int CHANNELS = 1;
	private static final int BITS_PER_SAMPLE = 16;

	private SoundEffectWavExporter()
	{
	}

	public static void main(String[] args) throws Exception
	{
		if (args.length != 3)
		{
			throw new IllegalArgumentException("Usage: SoundEffectWavExporter <rawDir> <outDir> <soundIdsCsv>");
		}

		Path rawDir = Paths.get(args[0]);
		Path outDir = Paths.get(args[1]);
		Files.createDirectories(outDir);

		SoundEffectTrackLoader loader = new SoundEffectTrackLoader();
		for (String token : args[2].split(","))
		{
			int soundId = Integer.parseInt(token.trim());
			SoundEffectTrackDefinition soundEffect = loader.load(Files.readAllBytes(rawDir.resolve(soundId + ".dat")));
			ensureSampleBufferCapacity(requiredSampleCount(soundEffect));
			Files.write(outDir.resolve("sound-" + soundId + ".wav"), wavFromSignedPcm8(soundEffect.mix()));
		}
	}

	private static int requiredSampleCount(SoundEffectTrackDefinition soundEffect)
	{
		int durationMs = 0;
		for (InstrumentDefinition instrument : soundEffect.instruments)
		{
			if (instrument != null)
			{
				durationMs = Math.max(durationMs, instrument.duration + instrument.offset);
			}
		}
		return Math.max(1000000, durationMs * SAMPLE_RATE / 1000 + 8);
	}

	private static void ensureSampleBufferCapacity(int sampleCount) throws ReflectiveOperationException
	{
		Field samplesField = InstrumentDefinition.class.getDeclaredField("samples");
		samplesField.setAccessible(true);
		int[] samples = (int[]) samplesField.get(null);
		if (samples.length < sampleCount)
		{
			samplesField.set(null, new int[sampleCount]);
		}
	}

	private static byte[] wavFromSignedPcm8(byte[] pcm8)
	{
		int dataSize = pcm8.length * 2;
		int byteRate = SAMPLE_RATE * CHANNELS * BITS_PER_SAMPLE / 8;
		int blockAlign = CHANNELS * BITS_PER_SAMPLE / 8;
		ByteArrayOutputStream out = new ByteArrayOutputStream(44 + dataSize);

		writeAscii(out, "RIFF");
		writeLe32(out, 36 + dataSize);
		writeAscii(out, "WAVE");
		writeAscii(out, "fmt ");
		writeLe32(out, 16);
		writeLe16(out, 1);
		writeLe16(out, CHANNELS);
		writeLe32(out, SAMPLE_RATE);
		writeLe32(out, byteRate);
		writeLe16(out, blockAlign);
		writeLe16(out, BITS_PER_SAMPLE);
		writeAscii(out, "data");
		writeLe32(out, dataSize);

		for (byte sample : pcm8)
		{
			writeLe16(out, sample << 8);
		}

		return out.toByteArray();
	}

	private static void writeAscii(ByteArrayOutputStream out, String value)
	{
		for (int index = 0; index < value.length(); index++)
		{
			out.write(value.charAt(index));
		}
	}

	private static void writeLe16(ByteArrayOutputStream out, int value)
	{
		out.write(value & 0xFF);
		out.write((value >>> 8) & 0xFF);
	}

	private static void writeLe32(ByteArrayOutputStream out, int value)
	{
		writeLe16(out, value);
		writeLe16(out, value >>> 16);
	}
}
